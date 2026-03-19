import OpenAI from 'openai';

import { ModelConfig } from '@/lib/types';

import {
  ProviderAdapter,
  ProviderApiError,
  ProviderMessage,
  ProviderStreamOptions,
  ProviderTestResult,
  toProviderError,
} from './types';
import {
  createOpenAIClient,
  createOpenAITextStream,
} from './openai';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const APP_TITLE = 'Model Arena';

function createOpenRouterHeaders(options?: ProviderStreamOptions) {
  const origin =
    options?.origin || options?.referer || 'http://localhost:3000';
  const referer = options?.referer || origin;

  return {
    'Content-Type': 'application/json',
    'HTTP-Referer': referer,
    'X-Title': APP_TITLE,
  };
}

async function requestOpenRouterStream(
  config: ModelConfig,
  messages: ProviderMessage[],
  options?: ProviderStreamOptions,
): Promise<ReadableStream> {
  const client = createOpenAIClient(config, {
    baseURL: config.baseUrl || OPENROUTER_BASE_URL,
    defaultHeaders: createOpenRouterHeaders(options),
  });

  const requestBody = {
    model: config.modelId,
    stream: true,
    messages: messages
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
      })),
  } as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming;

  const response = await client.chat.completions.create(
    requestBody as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming,
    { signal: options?.signal },
  );

  return createOpenAITextStream(response);
}

export const openRouterProviderAdapter: ProviderAdapter = {
  async createStream(
    config: ModelConfig,
    messages: ProviderMessage[],
    options?: ProviderStreamOptions,
  ): Promise<ReadableStream> {
    try {
      return await requestOpenRouterStream(config, messages, options);
    } catch (error) {
      throw toProviderError(error, 'OpenRouter request failed.');
    }
  },

  async testConnection(
    config: ModelConfig,
    options?: ProviderStreamOptions,
  ): Promise<ProviderTestResult> {
    try {
      const client = createOpenAIClient(config, {
        baseURL: config.baseUrl || OPENROUTER_BASE_URL,
        defaultHeaders: createOpenRouterHeaders(options),
      });

      const response = await client.chat.completions.create(
        {
          model: config.modelId,
          messages: [{ role: 'user', content: 'Hello' }],
          max_tokens: 50,
        },
        { signal: options?.signal },
      );

      return {
        message: 'Connection verified.',
        model: response.model,
      };
    } catch (error) {
      const providerError = toProviderError(
        error,
        'OpenRouter validation failed.',
      );

      if (providerError.status === 404) {
        throw new ProviderApiError(
          `Model "${config.modelId}" was not found on OpenRouter.`,
          {
            code: providerError.code,
            details: providerError.details,
            status: 404,
          },
        );
      }

      throw providerError;
    }
  },
};
