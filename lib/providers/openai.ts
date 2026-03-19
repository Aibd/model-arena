import OpenAI from 'openai';

import { ModelConfig } from '@/lib/types';

import {
  ProviderAdapter,
  ProviderApiError,
  ProviderMessage,
  ProviderStreamOptions,
  ProviderTestResult,
  getErrorCode,
  toProviderError,
} from './types';

type OpenAIMessage =
  OpenAI.Chat.Completions.ChatCompletionMessageParam;
type OpenAIStreamRequest =
  OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming &
    Record<string, unknown>;
type OpenAITestRequest =
  OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming &
    Record<string, unknown>;

const OPENAI_BASE_URL = 'https://api.openai.com/v1';
const XAI_BASE_URL = 'https://api.x.ai/v1';
const OPENAI_FETCH_RETRYABLE_ERROR_CODES = new Set([
  'ECONNRESET',
  'ENOTFOUND',
  'ESOCKETTIMEDOUT',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
]);
const OPENAI_FETCH_RETRY_ATTEMPTS = 3;

type OpenAICompatibleTestResponse = {
  error?: {
    code?: string | number;
    message?: string;
    param?: string | null;
    type?: string;
  };
  model?: string;
  output?: Array<{
    content?: Array<{
      text?: string;
      type?: string;
    }>;
    type?: string;
  }>;
  output_text?: string;
};

function resolveBaseUrl(config: ModelConfig): string {
  if (config.provider === 'custom') {
    if (!config.baseUrl) {
      throw new ProviderApiError('Custom providers require a base URL.', {
        status: 400,
      });
    }

    return config.baseUrl;
  }

  if (config.provider === 'xai') {
    return config.baseUrl || XAI_BASE_URL;
  }

  return config.baseUrl || OPENAI_BASE_URL;
}

function toOpenAIMessages(messages: ProviderMessage[]): OpenAIMessage[] {
  return messages
    .filter(
      (message): message is ProviderMessage & {
        role: 'system' | 'user' | 'assistant';
      } =>
        message.role === 'system' ||
        message.role === 'user' ||
        message.role === 'assistant',
    )
    .map((message) => ({
      role: message.role,
      content: message.content,
    }));
}

function isXAIResponsesModel(config: ModelConfig): boolean {
  return config.provider === 'xai' && /multi-agent/i.test(config.modelId);
}

function toXAIResponsesInput(messages: ProviderMessage[]) {
  return messages
    .filter(
      (
        message,
      ): message is ProviderMessage & {
        role: 'assistant' | 'system' | 'user';
      } =>
        message.role === 'assistant' ||
        message.role === 'system' ||
        message.role === 'user',
    )
    .map((message) => ({
      role: message.role,
      content: message.content,
    }));
}

function extractXAIResponseText(payload: OpenAICompatibleTestResponse): string {
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text;
  }

  const contentParts =
    payload.output
      ?.flatMap((item) => item.content || [])
      .map((content) => content.text || '')
      .filter(Boolean) || [];

  return contentParts.join('');
}

function createSingleChunkStream(content: string): ReadableStream {
  const encoder = new TextEncoder();

  return new ReadableStream({
    start(controller) {
      if (content) {
        controller.enqueue(encoder.encode(content));
      }
      controller.close();
    },
  });
}

function isRetryableFetchError(error: unknown): boolean {
  const code = getErrorCode(error);
  return (
    typeof code === 'string' &&
    OPENAI_FETCH_RETRYABLE_ERROR_CODES.has(code)
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fetchOpenAICompatible(
  input: string,
  init: RequestInit,
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt < OPENAI_FETCH_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await fetch(input, init);
    } catch (error) {
      lastError = error;
      if (
        !isRetryableFetchError(error) ||
        attempt === OPENAI_FETCH_RETRY_ATTEMPTS - 1
      ) {
        throw error;
      }

      await sleep(250 * (attempt + 1));
    }
  }

  throw lastError;
}

function createSSETextStream(response: Response): ReadableStream {
  if (!response.body) {
    throw new ProviderApiError('Provider response body was empty.', {
      status: response.status || 500,
    });
  }

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      const reader = response.body!.getReader();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split('\n\n');
          buffer = events.pop() || '';

          for (const event of events) {
            const lines = event
              .split('\n')
              .map((line) => line.trim())
              .filter((line) => line.startsWith('data:'));

            for (const line of lines) {
              const payload = line.slice(5).trim();
              if (!payload || payload === '[DONE]') {
                continue;
              }

              try {
                const parsed = JSON.parse(payload) as {
                  choices?: Array<{
                    delta?: {
                      content?: string;
                    };
                  }>;
                };
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) {
                  controller.enqueue(encoder.encode(content));
                }
              } catch {
                // Ignore malformed SSE chunks and continue the stream.
              }
            }
          }
        }

        controller.close();
      } catch (error) {
        controller.error(error);
      } finally {
        reader.releaseLock();
      }
    },
  });
}

export function createOpenAIClient(
  config: ModelConfig,
  options?: {
    baseURL?: string;
    defaultHeaders?: Record<string, string>;
  },
): OpenAI {
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: options?.baseURL || resolveBaseUrl(config),
    defaultHeaders: options?.defaultHeaders,
  });
}

function createOpenAICompatibleUrl(baseUrl: string, pathname: string): string {
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return new URL(pathname, normalizedBaseUrl).toString();
}

async function parseOpenAICompatibleError(response: Response): Promise<{
  code?: string | number;
  details?: unknown;
  message: string;
}> {
  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');

  try {
    if (isJson) {
      const payload = (await response.json()) as OpenAICompatibleTestResponse;
      return {
        code: payload.error?.code,
        details: payload,
        message:
          payload.error?.message ||
          `Provider returned ${response.status} ${response.statusText}.`,
      };
    }

    const text = (await response.text()).trim();
    return {
      details: text || undefined,
      message:
        text || `Provider returned ${response.status} ${response.statusText}.`,
    };
  } catch {
    return {
      message: `Provider returned ${response.status} ${response.statusText}.`,
    };
  }
}

export function createOpenAITextStream(
  response: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>,
): ReadableStream {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of response) {
          const content = chunk.choices[0]?.delta?.content;
          if (content) {
            controller.enqueue(encoder.encode(content));
          }
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

async function createOpenAICompatibleStream(
  config: ModelConfig,
  messages: ProviderMessage[],
  options?: ProviderStreamOptions & {
    baseURL?: string;
    defaultHeaders?: Record<string, string>;
    requestBody?: Record<string, unknown>;
  },
): Promise<ReadableStream> {
  try {
    if (isXAIResponsesModel(config)) {
      const response = await fetchOpenAICompatible(
        createOpenAICompatibleUrl(
          options?.baseURL || resolveBaseUrl(config),
          'responses',
        ),
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
            ...(options?.defaultHeaders ?? {}),
          },
          body: JSON.stringify({
            model: config.modelId,
            input: toXAIResponsesInput(messages),
            store: false,
            ...(options?.requestBody ?? {}),
          }),
          signal: options?.signal,
        },
      );

      if (!response.ok) {
        const parsedError = await parseOpenAICompatibleError(response);
        throw new ProviderApiError(parsedError.message, {
          code: parsedError.code,
          details: parsedError.details,
          status: response.status,
        });
      }

      const payload = (await response.json()) as OpenAICompatibleTestResponse;
      return createSingleChunkStream(extractXAIResponseText(payload));
    }

    if (config.provider === 'xai') {
      const response = await fetchOpenAICompatible(
        createOpenAICompatibleUrl(
          options?.baseURL || resolveBaseUrl(config),
          'chat/completions',
        ),
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
            ...(options?.defaultHeaders ?? {}),
          },
          body: JSON.stringify({
            model: config.modelId,
            stream: true,
            messages: toOpenAIMessages(messages),
            ...(options?.requestBody ?? {}),
          }),
          signal: options?.signal,
        },
      );

      if (!response.ok) {
        const parsedError = await parseOpenAICompatibleError(response);
        throw new ProviderApiError(parsedError.message, {
          code: parsedError.code,
          details: parsedError.details,
          status: response.status,
        });
      }

      return createSSETextStream(response);
    }

    const client = createOpenAIClient(config, {
      baseURL: options?.baseURL,
      defaultHeaders: options?.defaultHeaders,
    });

    const response = await client.chat.completions.create(
      {
        model: config.modelId,
        stream: true,
        messages: toOpenAIMessages(messages),
        ...(options?.requestBody ?? {}),
      } as OpenAIStreamRequest,
      { signal: options?.signal },
    );

    return createOpenAITextStream(response);
  } catch (error) {
    throw toProviderError(error, 'OpenAI-compatible request failed.');
  }
}

async function testOpenAICompatibleConnection(
  config: ModelConfig,
  options?: ProviderStreamOptions & {
    baseURL?: string;
    defaultHeaders?: Record<string, string>;
    requestBody?: Record<string, unknown>;
  },
): Promise<ProviderTestResult> {
  try {
    if (isXAIResponsesModel(config)) {
      const response = await fetchOpenAICompatible(
        createOpenAICompatibleUrl(
          options?.baseURL || resolveBaseUrl(config),
          'responses',
        ),
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
            ...(options?.defaultHeaders ?? {}),
          },
          body: JSON.stringify({
            model: config.modelId,
            input: [{ role: 'user', content: 'Hello' }],
            store: false,
            ...(options?.requestBody ?? {}),
          }),
          signal: options?.signal,
        },
      );

      if (!response.ok) {
        const parsedError = await parseOpenAICompatibleError(response);
        throw new ProviderApiError(parsedError.message, {
          code: parsedError.code,
          details: parsedError.details,
          status: response.status,
        });
      }

      const payload = (await response.json()) as OpenAICompatibleTestResponse;
      return {
        message: 'Connection verified.',
        model: payload.model || config.modelId,
      };
    }

    const baseURL = options?.baseURL || resolveBaseUrl(config);
    const endpoint = createOpenAICompatibleUrl(baseURL, 'chat/completions');
    const requestBody = {
      model: config.modelId,
      messages: [{ role: 'user', content: 'Hello' }],
      max_tokens: 50,
      ...(options?.requestBody ?? {}),
    } as OpenAITestRequest;

    const response = await fetchOpenAICompatible(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        ...(options?.defaultHeaders ?? {}),
      },
      body: JSON.stringify(requestBody),
      signal: options?.signal,
    });

    if (!response.ok) {
      const parsedError = await parseOpenAICompatibleError(response);
      throw new ProviderApiError(parsedError.message, {
        code: parsedError.code,
        details: parsedError.details,
        status: response.status,
      });
    }

    const payload = (await response.json()) as OpenAICompatibleTestResponse;

    return {
      message: 'Connection verified.',
      model: payload.model || config.modelId,
    };
  } catch (error) {
    throw toProviderError(error, 'OpenAI-compatible validation failed.');
  }
}

export const openAIProviderAdapter: ProviderAdapter = {
  createStream: createOpenAICompatibleStream,
  testConnection: testOpenAICompatibleConnection,
};
