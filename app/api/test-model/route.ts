import { NextRequest } from 'next/server';

import { withAuth, ApiRouteError, createErrorResponse, json } from '@/lib/api-utils';
import { findModelById } from '@/lib/db';
import { testConnection } from '@/lib/providers';
import { ModelConfig } from '@/lib/types';

export const runtime = 'nodejs';

type TestModelBody = {
  modelConfig?: ModelConfig | null;
};

export const POST = withAuth(
  async (req: NextRequest, _context, auth) => {
    if (!auth) {
      return json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await req.json()) as TestModelBody;
    if (!body.modelConfig) {
      throw new ApiRouteError('Model configuration is required.', {
        status: 400,
      });
    }

    const modelConfig =
      (body.modelConfig.id
        ? await findModelById(auth.userId, body.modelConfig.id)
        : null) || body.modelConfig;

    const result = await testConnection(modelConfig, {
      origin: req.headers.get('origin'),
      referer: req.headers.get('referer'),
      signal: req.signal,
    });

    return json({
      success: true,
      message: result.message,
      model: result.model,
    });
  },
  {
    onError: (error) =>
      createErrorResponse(error, 'Model validation failed.'),
  },
);
