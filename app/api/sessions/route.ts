import { NextRequest } from 'next/server';

import { withAuth, json } from '@/lib/api-utils';
import { listChatSessions, upsertChatSession } from '@/lib/db';
import { ChatSession } from '@/lib/types';

export const runtime = 'nodejs';

export const GET = withAuth(
  async (_req: NextRequest, _context, auth) => {
    if (!auth) {
      return json([]);
    }

    const items = await listChatSessions(auth.userId);
    return json(items);
  },
  { optional: true },
);

export const POST = withAuth(async (req: NextRequest, _context, auth) => {
  if (!auth) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const session = (await req.json()) as ChatSession;
  await upsertChatSession(auth.userId, session);

  return json({ success: true });
});
