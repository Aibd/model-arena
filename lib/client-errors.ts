type ErrorWithCause = Error & {
  cause?: unknown;
  response?: Response;
};

function getNestedMessage(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const value = error as {
    error?: { message?: string };
    message?: string;
    cause?: unknown;
  };

  if (value.error?.message) {
    return value.error.message;
  }

  if (
    value.message &&
    value.message !== 'An error occurred.' &&
    value.message !== 'Request failed.'
  ) {
    return value.message;
  }

  return getNestedMessage(value.cause);
}

export async function getClientErrorMessage(
  error: unknown,
  fallback = 'Request failed, please check API configuration',
): Promise<string> {
  const value = error as ErrorWithCause | undefined;

  try {
    const response = value?.response;
    if (response) {
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const payload = (await response.clone().json()) as {
          error?: string;
          message?: string;
        };
        if (payload.message || payload.error) {
          return payload.message || payload.error || fallback;
        }
      }

      const text = (await response.clone().text()).trim();
      if (text) {
        return text;
      }
    }
  } catch {
    // Fall through to nested message extraction.
  }

  return getNestedMessage(error) || fallback;
}
