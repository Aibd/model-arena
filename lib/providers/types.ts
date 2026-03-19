import { ModelConfig } from '@/lib/types';

export interface ProviderMessage {
  role: 'assistant' | 'data' | 'function' | 'system' | 'tool' | 'user';
  content: string;
}

export interface ProviderStreamOptions {
  origin?: string | null;
  referer?: string | null;
  signal?: AbortSignal;
}

export interface ProviderTestResult {
  message: string;
  model: string;
}

export interface ProviderAdapter {
  createStream(
    config: ModelConfig,
    messages: ProviderMessage[],
    options?: ProviderStreamOptions,
  ): Promise<ReadableStream>;
  testConnection(
    config: ModelConfig,
    options?: ProviderStreamOptions,
  ): Promise<ProviderTestResult>;
}

type ErrorLike = {
  cause?: ErrorLike;
  code?: string | number;
  details?: unknown;
  error?: {
    code?: string | number;
    message?: string;
  };
  message?: string;
  response?: {
    status?: number;
    statusText?: string;
  };
  status?: number;
};

function getNestedErrorCode(error: unknown): string | number | undefined {
  const value = error as ErrorLike | undefined;
  return (
    value?.code ??
    value?.error?.code ??
    value?.cause?.code ??
    value?.cause?.error?.code
  );
}

function getNestedErrorMessage(error: unknown): string | undefined {
  const value = error as ErrorLike | undefined;
  if (value?.error?.message) {
    return value.error.message;
  }
  if (value?.cause?.error?.message) {
    return value.cause.error.message;
  }
  if (value?.cause?.message) {
    return value.cause.message;
  }
  if (
    value?.message &&
    value.message !== 'fetch failed' &&
    value.message !== 'Connection error.'
  ) {
    return value.message;
  }
  return undefined;
}

export class ProviderApiError extends Error {
  code?: string | number;
  details?: unknown;
  status: number;

  constructor(
    message: string,
    options?: {
      code?: string | number;
      details?: unknown;
      status?: number;
    },
  ) {
    super(message);
    this.name = 'ProviderApiError';
    this.code = options?.code;
    this.details = options?.details;
    this.status = options?.status ?? 500;
  }
}

export function getErrorStatus(error: unknown): number | undefined {
  const value = error as ErrorLike | undefined;
  return value?.status ?? value?.response?.status;
}

export function getErrorCode(error: unknown): string | number | undefined {
  return getNestedErrorCode(error);
}

export function getErrorMessage(
  error: unknown,
  fallback = 'Provider request failed.',
): string {
  const value = error as ErrorLike | undefined;
  const nestedMessage = getNestedErrorMessage(error);
  const nestedCode = getNestedErrorCode(error);

  if (nestedCode === 'UND_ERR_CONNECT_TIMEOUT') {
    return `Connection timed out while reaching the provider endpoint. Check the API base URL and network access.`;
  }

  if (
    nestedCode === 'ETIMEDOUT' ||
    nestedCode === 'ESOCKETTIMEDOUT' ||
    nestedCode === 'UND_ERR_HEADERS_TIMEOUT'
  ) {
    return `The provider request timed out. Check the API base URL, proxy settings, and network access to the provider.`;
  }

  if (nestedCode === 'ECONNREFUSED') {
    return `The provider endpoint refused the connection. Check whether the API base URL is correct and reachable.`;
  }

  if (nestedCode === 'ENOTFOUND') {
    return `The provider hostname could not be resolved. Check the API base URL and DNS or proxy configuration.`;
  }

  return (
    nestedMessage ??
    value?.response?.statusText ??
    fallback
  );
}

export function toProviderError(
  error: unknown,
  fallback = 'Provider request failed.',
): ProviderApiError {
  if (error instanceof ProviderApiError) {
    return error;
  }

  return new ProviderApiError(getErrorMessage(error, fallback), {
    code: getErrorCode(error),
    details: error,
    status: getErrorStatus(error) ?? 500,
  });
}
