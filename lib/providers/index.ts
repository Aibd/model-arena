import { ModelConfig, ModelProvider } from '@/lib/types';

import { anthropicProviderAdapter } from './anthropic';
import { openAIProviderAdapter } from './openai';
import { openRouterProviderAdapter } from './openrouter';
import {
  ProviderAdapter,
  ProviderMessage,
  ProviderStreamOptions,
  ProviderTestResult,
} from './types';

const providerAdapters: Record<ModelProvider, ProviderAdapter> = {
  anthropic: anthropicProviderAdapter,
  custom: openAIProviderAdapter,
  deepseek: openAIProviderAdapter,
  groq: openAIProviderAdapter,
  minimax: openAIProviderAdapter,
  openai: openAIProviderAdapter,
  openrouter: openRouterProviderAdapter,
  xai: openAIProviderAdapter,
  zhipu: openAIProviderAdapter,
};

function getProviderAdapter(provider: ModelProvider): ProviderAdapter {
  return providerAdapters[provider] || openAIProviderAdapter;
}

export async function createStream(
  config: ModelConfig,
  messages: ProviderMessage[],
  options?: ProviderStreamOptions,
): Promise<ReadableStream> {
  return getProviderAdapter(config.provider).createStream(config, messages, options);
}

export async function testConnection(
  config: ModelConfig,
  options?: ProviderStreamOptions,
): Promise<ProviderTestResult> {
  return getProviderAdapter(config.provider).testConnection(config, options);
}

export type {
  ProviderAdapter,
  ProviderMessage,
  ProviderStreamOptions,
  ProviderTestResult,
} from './types';
export {
  ProviderApiError,
  getErrorCode,
  getErrorMessage,
  getErrorStatus,
  toProviderError,
} from './types';
