import { Session } from 'next-auth';
import { getServerSession } from 'next-auth';
import { NextRequest } from 'next/server';

import { authOptions } from '@/lib/auth';

type ErrorLike = {
  code?: string | number;
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

export interface AuthContext {
  session: Session;
  userId: string;
}

export class ApiRouteError extends Error {
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
    this.name = 'ApiRouteError';
    this.code = options?.code;
    this.details = options?.details;
    this.status = options?.status ?? 500;
  }
}

export function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
}

function normalizeStatus(error: unknown): number {
  const value = error as ErrorLike | undefined;
  const status = value?.status ?? value?.response?.status ?? 500;
  return status >= 400 && status < 600 ? status : 500;
}

function normalizeCode(error: unknown): string | number | undefined {
  const value = error as ErrorLike | undefined;
  return value?.code ?? value?.error?.code;
}

function normalizeMessage(
  error: unknown,
  fallback = 'Internal server error.',
): string {
  const value = error as ErrorLike | undefined;
  return (
    value?.error?.message ??
    value?.message ??
    value?.response?.statusText ??
    fallback
  );
}

export function createErrorResponse(
  error: unknown,
  fallback = 'Internal server error.',
): Response {
  return json(
    {
      success: false,
      error: normalizeMessage(error, fallback),
      code: normalizeCode(error),
      statusCode: normalizeStatus(error),
    },
    { status: normalizeStatus(error) },
  );
}

type AuthHandler<TContext> = (
  req: NextRequest,
  context: TContext,
  auth: AuthContext | null,
) => Promise<Response>;

export function withAuth<TContext = unknown>(
  handler: AuthHandler<TContext>,
  options?: {
    onError?: (
      error: unknown,
      req: NextRequest,
      context: TContext,
    ) => Promise<Response> | Response;
    onUnauthorized?: (
      req: NextRequest,
      context: TContext,
    ) => Promise<Response> | Response;
    optional?: boolean;
  },
) {
  return async (req: NextRequest, context: TContext): Promise<Response> => {
    try {
      const session = await getServerSession(authOptions);

      if (!session?.user) {
        if (options?.optional) {
          return handler(req, context, null);
        }

        if (options?.onUnauthorized) {
          return options.onUnauthorized(req, context);
        }

        return json({ success: false, error: 'Unauthorized' }, { status: 401 });
      }

      const userId = session.user.id || session.user.email;
      if (!userId) {
        throw new ApiRouteError('Unable to resolve the authenticated user.', {
          status: 500,
        });
      }

      return handler(req, context, { session, userId });
    } catch (error) {
      if (options?.onError) {
        return options.onError(error, req, context);
      }

      return createErrorResponse(error);
    }
  };
}
