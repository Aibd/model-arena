import { NextRequest } from 'next/server';

import { withAuth, ApiRouteError, json } from '@/lib/api-utils';
import { deleteChatSession, getChatSessionById } from '@/lib/db';

export const runtime = 'nodejs';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const GET = withAuth(
  async (_req: NextRequest, context: RouteContext, auth) => {
    if (!auth) {
      return json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const session = await getChatSessionById(auth.userId, id);

    if (!session) {
      throw new ApiRouteError('Session not found.', { status: 404 });
    }

    return json(session);
  },
);

export const DELETE = withAuth(
  async (_req: NextRequest, context: RouteContext, auth) => {
    if (!auth) {
      return json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const deleted = await deleteChatSession(auth.userId, id);

    if (!deleted) {
      throw new ApiRouteError('Session not found.', { status: 404 });
    }

    return json({ success: true });
  },
);
