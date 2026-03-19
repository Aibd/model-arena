import { StreamingTextResponse } from 'ai';
import { NextRequest } from 'next/server';

import { withAuth, ApiRouteError, createErrorResponse } from '@/lib/api-utils';
import { findModelById } from '@/lib/db';
import { createStream } from '@/lib/providers';
import { Message, ModelConfig } from '@/lib/types';

export const runtime = 'nodejs';

type ChatRequestBody = {
  messages?: Message[];
  modelConfig?: Pick<ModelConfig, 'id'> | null;
};

export const POST = withAuth(
  async (req: NextRequest, _context, auth) => {
    if (!auth) {
      throw new ApiRouteError('Unauthorized', { status: 401 });
    }

    const body = (await req.json()) as ChatRequestBody;
    const modelId = body.modelConfig?.id;

    if (!modelId) {
      throw new ApiRouteError('Model selection is required.', { status: 400 });
    }

    const modelConfig = await findModelById(auth.userId, modelId);
    if (!modelConfig) {
      throw new ApiRouteError('Model not found.', { status: 404 });
    }

    const stream = await createStream(modelConfig, body.messages ?? [], {
      origin: req.headers.get('origin'),
      referer: req.headers.get('referer'),
      signal: req.signal,
    });

    return new StreamingTextResponse(stream);
  },
  {
    onError: (error) => createErrorResponse(error, 'Chat request failed.'),
  },
);
