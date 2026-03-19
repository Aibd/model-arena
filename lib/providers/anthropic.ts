import Anthropic from '@anthropic-ai/sdk';

import { ModelConfig } from '@/lib/types';

import {
  ProviderAdapter,
  ProviderMessage,
  ProviderStreamOptions,
  ProviderTestResult,
  toProviderError,
} from './types';

const ANTHROPIC_BASE_URL = 'https://api.anthropic.com';

function createAnthropicClient(config: ModelConfig): Anthropic {
  return new Anthropic({
    apiKey: config.apiKey,
    baseURL: config.baseUrl || ANTHROPIC_BASE_URL,
  });
}

function splitAnthropicMessages(messages: ProviderMessage[]) {
  const system = messages.find((message) => message.role === 'system')?.content;
  const conversation = messages
    .filter(
      (message): message is ProviderMessage & {
        role: 'user' | 'assistant';
      } => message.role === 'user' || message.role === 'assistant',
    )
    .map((message) => ({
      role: message.role,
      content: message.content,
    }));

  return { conversation, system };
}

function createAnthropicTextStream(
  response: AsyncIterable<Anthropic.Messages.RawMessageStreamEvent>,
): ReadableStream {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        for await (const event of response) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

export const anthropicProviderAdapter: ProviderAdapter = {
  async createStream(
    config: ModelConfig,
    messages: ProviderMessage[],
    options?: ProviderStreamOptions,
  ): Promise<ReadableStream> {
    try {
      const client = createAnthropicClient(config);
      const { conversation, system } = splitAnthropicMessages(messages);
      const response = await client.messages.create(
        {
          model: config.modelId,
          stream: true,
          max_tokens: 4096,
          messages: conversation,
          system,
        },
        { signal: options?.signal },
      );

      return createAnthropicTextStream(response);
    } catch (error) {
      throw toProviderError(error, 'Anthropic request failed.');
    }
  },

  async testConnection(
    config: ModelConfig,
    options?: ProviderStreamOptions,
  ): Promise<ProviderTestResult> {
    try {
      const client = createAnthropicClient(config);
      const response = await client.messages.create(
        {
          model: config.modelId,
          max_tokens: 50,
          messages: [{ role: 'user', content: 'Hello' }],
        },
        { signal: options?.signal },
      );

      return {
        message: 'Connection verified.',
        model: response.model,
      };
    } catch (error) {
      throw toProviderError(error, 'Anthropic validation failed.');
    }
  },
};
