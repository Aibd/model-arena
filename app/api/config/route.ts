import { NextRequest } from 'next/server';

import { withAuth, json } from '@/lib/api-utils';
import { readAppConfig, writeAppConfig } from '@/lib/db';
import { AppConfig } from '@/lib/types';

const emptyConfig: AppConfig = {
  providerSettings: [],
  models: [],
  comparison: {
    modelAId: '',
    modelBId: '',
  },
};

export const GET = withAuth(
  async (_req: NextRequest, _context, auth) => {
    if (!auth) {
      return json(emptyConfig);
    }

    const config = await readAppConfig(auth.userId, true);
    return json(config);
  },
  { optional: true },
);

export const POST = withAuth(async (req: NextRequest, _context, auth) => {
  if (!auth) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const config = (await req.json()) as AppConfig;
  await writeAppConfig(auth.userId, config);

  return json({ success: true });
});
