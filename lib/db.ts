import fs from 'fs';
import path from 'path';

import { open, Database } from 'sqlite';
import sqlite3 from 'sqlite3';

import { decryptSecret, encryptSecret, isEncryptedSecret } from '@/lib/encryption';
import {
  AppConfig,
  ChatSession,
  Message,
  ModelConfig,
  ModelProvider,
  ProviderSettings,
} from '@/lib/types';

const dbFile = path.join(process.cwd(), 'data', 'app.db');
const dbDir = path.dirname(dbFile);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

type Db = Database<sqlite3.Database, sqlite3.Statement>;

let dbPromise: Promise<Db> | null = null;
let initPromise: Promise<void> | null = null;

async function getDb(): Promise<Db> {
  if (!dbPromise) {
    dbPromise = open({
      filename: dbFile,
      driver: sqlite3.Database,
    });
  }

  const db = await dbPromise;

  if (!initPromise) {
    initPromise = initializeDb(db);
  }

  await initPromise;
  return db;
}

async function initializeDb(db: Db): Promise<void> {
  await db.exec('PRAGMA journal_mode = WAL');
  await db.exec(`
    CREATE TABLE IF NOT EXISTS models (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      name TEXT NOT NULL,
      provider TEXT NOT NULL,
      api_key TEXT NOT NULL,
      base_url TEXT,
      model_id TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS comparison (
      user_id TEXT PRIMARY KEY,
      model_a_id TEXT,
      model_b_id TEXT
    );

    CREATE TABLE IF NOT EXISTS provider_settings (
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      api_key TEXT NOT NULL,
      base_url TEXT,
      PRIMARY KEY (user_id, provider)
    );

    CREATE TABLE IF NOT EXISTS hidden_providers (
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      PRIMARY KEY (user_id, provider)
    );

    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      type TEXT NOT NULL,
      model_a_id TEXT NOT NULL,
      model_b_id TEXT
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      side TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      idx INTEGER NOT NULL
    );
  `);

  await runSchemaMigrations(db);
  await migrateConfigFromJsonIfNeeded(db);
  await encryptStoredApiKeys(db);
  await backfillProviderSettings(db);
}

async function runSchemaMigrations(db: Db): Promise<void> {
  try {
    const modelColumns = await db.all<Array<{ name: string }>>(
      'PRAGMA table_info(models)',
    );
    if (!modelColumns.some((column) => column.name === 'user_id')) {
      await db.exec('ALTER TABLE models ADD COLUMN user_id TEXT');
    }

    const sessionColumns = await db.all<Array<{ name: string }>>(
      'PRAGMA table_info(chat_sessions)',
    );
    if (!sessionColumns.some((column) => column.name === 'user_id')) {
      await db.exec('ALTER TABLE chat_sessions ADD COLUMN user_id TEXT');
    }

    const comparisonColumns = await db.all<Array<{ name: string }>>(
      'PRAGMA table_info(comparison)',
    );
    if (comparisonColumns.some((column) => column.name === 'id')) {
      await db.exec(`
        CREATE TABLE IF NOT EXISTS comparison_new (
          user_id TEXT PRIMARY KEY,
          model_a_id TEXT,
          model_b_id TEXT
        );

        INSERT INTO comparison_new (user_id, model_a_id, model_b_id)
        SELECT 'system', model_a_id, model_b_id
        FROM comparison
        WHERE id = 1;

        DROP TABLE comparison;
        ALTER TABLE comparison_new RENAME TO comparison;
      `);
    }
  } catch (error) {
    console.error('Schema migration failed:', error);
    throw error;
  }
}

async function migrateConfigFromJsonIfNeeded(db: Db): Promise<void> {
  const configPath = path.join(process.cwd(), 'config', 'models.json');
  if (!fs.existsSync(configPath)) {
    return;
  }

  const row = await db.get<{ count: number }>(
    'SELECT COUNT(*) as count FROM models',
  );
  if (row?.count) {
    return;
  }

  const raw = fs.readFileSync(configPath, 'utf8');
  const parsed = JSON.parse(raw) as AppConfig;
  await writeAppConfigWithDb(db, 'system', parsed);

  try {
    fs.unlinkSync(configPath);
  } catch (error) {
    console.warn('Unable to remove migrated config/models.json:', error);
  }
}

async function encryptStoredApiKeys(db: Db): Promise<void> {
  const rows = await db.all<Array<{ api_key: string; id: string }>>(
    "SELECT id, api_key FROM models WHERE api_key IS NOT NULL AND api_key != ''",
  );
  const plaintextRows = rows.filter((row) => !isEncryptedSecret(row.api_key));

  if (plaintextRows.length === 0) {
    return;
  }

  await db.exec('BEGIN');
  try {
    for (const row of plaintextRows) {
      await db.run(
        'UPDATE models SET api_key = ? WHERE id = ?',
        encryptSecret(row.api_key),
        row.id,
      );
    }
    await db.exec('COMMIT');
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
}

function maskApiKey(value: string): string {
  return value ? 'REDACTED' : '';
}

function readApiKey(value: string): string {
  return value ? decryptSecret(value) : '';
}

function writeApiKey(value: string): string {
  return value ? encryptSecret(value) : '';
}

function normalizeProviderSettings(
  settings: ProviderSettings[] | undefined,
): ProviderSettings[] {
  if (!Array.isArray(settings)) {
    return [];
  }

  return settings.filter(
    (setting): setting is ProviderSettings =>
      Boolean(setting?.provider) &&
      (Boolean(setting.apiKey) || Boolean(setting.baseUrl)),
  );
}

async function readProviderSettings(
  db: Db,
  userId: string,
  redact = false,
): Promise<ProviderSettings[]> {
  const rows = await db.all<
    Array<{
      api_key: string;
      base_url: string | null;
      provider: ModelProvider;
    }>
  >(
    `
      SELECT provider, api_key, base_url
      FROM provider_settings
      WHERE user_id = ?
      ORDER BY provider ASC
    `,
    userId,
  );

  return rows.map((row) => ({
    provider: row.provider,
    apiKey: redact ? maskApiKey(row.api_key) : readApiKey(row.api_key),
    baseUrl: row.base_url || undefined,
  }));
}

async function backfillProviderSettings(db: Db): Promise<void> {
  const rows = await db.all<
    Array<{
      api_key: string;
      base_url: string | null;
      provider: ModelProvider;
      user_id: string | null;
    }>
  >(
    `
      SELECT user_id, provider, api_key, base_url
      FROM models
      WHERE api_key IS NOT NULL AND api_key != ''
         OR base_url IS NOT NULL AND base_url != ''
      ORDER BY user_id ASC, provider ASC, id ASC
    `,
  );

  if (rows.length === 0) {
    return;
  }

  const existing = await db.all<
    Array<{ provider: ModelProvider; user_id: string }>
  >('SELECT user_id, provider FROM provider_settings');
  const existingKeys = new Set(
    existing.map((row) => `${row.user_id}:${row.provider}`),
  );

  const insertions = rows.filter((row) => {
    const userId = row.user_id || 'system';
    const key = `${userId}:${row.provider}`;
    if (existingKeys.has(key)) {
      return false;
    }

    existingKeys.add(key);
    return true;
  });

  if (insertions.length === 0) {
    return;
  }

  await db.exec('BEGIN');
  try {
    for (const row of insertions) {
      await db.run(
        `
          INSERT INTO provider_settings (user_id, provider, api_key, base_url)
          VALUES (?, ?, ?, ?)
        `,
        row.user_id || 'system',
        row.provider,
        row.api_key,
        row.base_url,
      );
    }
    await db.exec('COMMIT');
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
}

export async function readAppConfig(
  userId: string,
  redact = false,
): Promise<AppConfig> {
  const db = await getDb();
  const providerSettings = await readProviderSettings(db, userId, redact);
  const providerSettingsMap = new Map(
    providerSettings.map((setting) => [setting.provider, setting]),
  );
  const rows = await db.all<
    Array<{
      api_key: string;
      base_url: string | null;
      id: string;
      model_id: string;
      name: string;
      provider: ModelConfig['provider'];
    }>
  >(
    `
      SELECT id, name, provider, api_key, base_url, model_id
      FROM models
      WHERE user_id = ?
      ORDER BY name ASC
    `,
    userId,
  );

  const comparisonRow = await db.get<{
    model_a_id: string | null;
    model_b_id: string | null;
  }>(
    `
      SELECT model_a_id, model_b_id
      FROM comparison
      WHERE user_id = ?
    `,
    userId,
  );

  const hiddenProvidersRows = await db.all<Array<{ provider: string }>>(
    'SELECT provider FROM hidden_providers WHERE user_id = ?',
    userId,
  );

  return {
    providerSettings,
    models: rows.map((row) => ({
      id: row.id,
      name: row.name,
      provider: row.provider,
      apiKey:
        row.api_key || !providerSettingsMap.has(row.provider)
          ? redact
            ? maskApiKey(row.api_key)
            : readApiKey(row.api_key)
          : providerSettingsMap.get(row.provider)?.apiKey || '',
      baseUrl:
        row.base_url ||
        providerSettingsMap.get(row.provider)?.baseUrl ||
        undefined,
      modelId: row.model_id,
    })),
    hiddenProviders: hiddenProvidersRows.map((r) => r.provider),
    comparison: {
      modelAId: comparisonRow?.model_a_id || '',
      modelBId: comparisonRow?.model_b_id || '',
    },
  };
}

async function writeAppConfigWithDb(
  db: Db,
  userId: string,
  config: AppConfig,
): Promise<void> {
  await db.exec('BEGIN');
  try {
    const normalizedProviderSettings = normalizeProviderSettings(
      config.providerSettings,
    );
    const providerSettingsMap = new Map(
      normalizedProviderSettings.map((setting) => [setting.provider, setting]),
    );
    const existingModels = await db.all<Array<{ api_key: string; id: string }>>(
      'SELECT id, api_key FROM models WHERE user_id = ?',
      userId,
    );
    const existingKeyMap = new Map(
      existingModels.map((model) => [model.id, model.api_key]),
    );

    const existingProviderSettings = await db.all<
      Array<{ api_key: string; provider: ModelProvider }>
    >(
      'SELECT provider, api_key FROM provider_settings WHERE user_id = ?',
      userId,
    );
    const existingProviderKeyMap = new Map(
      existingProviderSettings.map((setting) => [setting.provider, setting.api_key]),
    );

    await db.run('DELETE FROM models WHERE user_id = ?', userId);
    await db.run('DELETE FROM provider_settings WHERE user_id = ?', userId);
    await db.run('DELETE FROM hidden_providers WHERE user_id = ?', userId);

    for (const setting of normalizedProviderSettings) {
      const storedApiKey =
        setting.apiKey === 'REDACTED'
          ? existingProviderKeyMap.get(setting.provider) || ''
          : writeApiKey(setting.apiKey);

      await db.run(
        `
          INSERT INTO provider_settings (user_id, provider, api_key, base_url)
          VALUES (?, ?, ?, ?)
        `,
        userId,
        setting.provider,
        storedApiKey,
        setting.baseUrl ?? null,
      );
    }

    const insertSql = `
      INSERT INTO models (id, user_id, name, provider, api_key, base_url, model_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    for (const model of config.models) {
      const providerDefaults = providerSettingsMap.get(model.provider);
      const keepModelKey =
        model.apiKey &&
        model.apiKey !== 'REDACTED' &&
        model.apiKey !== providerDefaults?.apiKey;
      const storedApiKey =
        model.apiKey === 'REDACTED'
          ? existingKeyMap.get(model.id) || ''
          : keepModelKey
            ? writeApiKey(model.apiKey)
            : '';
      const storedBaseUrl =
        model.baseUrl && model.baseUrl !== providerDefaults?.baseUrl
          ? model.baseUrl
          : null;

      await db.run(
        insertSql,
        model.id,
        userId,
        model.name,
        model.provider,
        storedApiKey,
        storedBaseUrl,
        model.modelId,
      );
    }

    if (config.hiddenProviders) {
      for (const provider of config.hiddenProviders) {
        await db.run(
          'INSERT INTO hidden_providers (user_id, provider) VALUES (?, ?)',
          userId,
          provider,
        );
      }
    }

    const comparison = config.comparison || { modelAId: '', modelBId: '' };
    await db.run(
      `
        INSERT INTO comparison (user_id, model_a_id, model_b_id)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          model_a_id = excluded.model_a_id,
          model_b_id = excluded.model_b_id
      `,
      userId,
      comparison.modelAId || null,
      comparison.modelBId || null,
    );

    await db.exec('COMMIT');
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
}

export async function writeAppConfig(
  userId: string,
  config: AppConfig,
): Promise<void> {
  const db = await getDb();
  await writeAppConfigWithDb(db, userId, config);
}

export async function findModelById(
  userId: string,
  id: string,
): Promise<ModelConfig | null> {
  const db = await getDb();
  const row = await db.get<{
    api_key: string;
    base_url: string | null;
    id: string;
    model_id: string;
    name: string;
    provider: ModelConfig['provider'];
  }>(
    `
      SELECT id, name, provider, api_key, base_url, model_id
      FROM models
      WHERE id = ? AND user_id = ?
    `,
    id,
    userId,
  );

  if (!row) {
    return null;
  }

  const providerSetting = await db.get<{
    api_key: string;
    base_url: string | null;
  }>(
    `
      SELECT api_key, base_url
      FROM provider_settings
      WHERE user_id = ? AND provider = ?
    `,
    userId,
    row.provider,
  );

  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    apiKey: row.api_key
      ? readApiKey(row.api_key)
      : readApiKey(providerSetting?.api_key || ''),
    baseUrl: row.base_url || providerSetting?.base_url || undefined,
    modelId: row.model_id,
  };
}

export async function upsertChatSession(
  userId: string,
  session: ChatSession,
): Promise<void> {
  const db = await getDb();

  await db.exec('BEGIN');
  try {
    await db.run(
      `
        INSERT INTO chat_sessions (
          id,
          user_id,
          title,
          created_at,
          type,
          model_a_id,
          model_b_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          created_at = excluded.created_at,
          type = excluded.type,
          model_a_id = excluded.model_a_id,
          model_b_id = excluded.model_b_id
      `,
      session.id,
      userId,
      session.title,
      session.createdAt,
      session.type,
      session.modelAId,
      session.modelBId || null,
    );

    await db.run('DELETE FROM chat_messages WHERE session_id = ?', session.id);

    const insertMessageSql = `
      INSERT INTO chat_messages (
        id,
        session_id,
        side,
        role,
        content,
        created_at,
        idx
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    const toStoredMessageId = (
      side: 'A' | 'B',
      message: Message,
      idx: number,
    ) => `${session.id}:${side}:${message.id || idx}`;

    let index = 0;
    for (const message of session.messagesA) {
      await db.run(
        insertMessageSql,
        toStoredMessageId('A', message, index),
        session.id,
        'A',
        message.role,
        message.content,
        session.createdAt,
        index++,
      );
    }

    for (const message of session.messagesB) {
      await db.run(
        insertMessageSql,
        toStoredMessageId('B', message, index),
        session.id,
        'B',
        message.role,
        message.content,
        session.createdAt,
        index++,
      );
    }

    await db.exec('COMMIT');
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
}

export async function listChatSessions(
  userId: string,
): Promise<{ createdAt: number; id: string; title: string; type: string }[]> {
  const db = await getDb();
  return db.all<Array<{ createdAt: number; id: string; title: string; type: string }>>(
    `
      SELECT id, title, created_at as createdAt, type
      FROM chat_sessions
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 100
    `,
    userId,
  );
}

export async function deleteChatSession(
  userId: string,
  id: string,
): Promise<boolean> {
  const db = await getDb();

  await db.exec('BEGIN');
  try {
    const sessionDeleteResult = await db.run(
      `
        DELETE FROM chat_sessions
        WHERE id = ? AND user_id = ?
      `,
      id,
      userId,
    );

    if (sessionDeleteResult.changes) {
      await db.run('DELETE FROM chat_messages WHERE session_id = ?', id);
    }

    await db.exec('COMMIT');
    return Boolean(sessionDeleteResult.changes);
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
}

export async function getChatSessionById(
  userId: string,
  id: string,
): Promise<ChatSession | null> {
  const db = await getDb();
  const sessionRow = await db.get<{
    createdAt: number;
    id: string;
    modelAId: string;
    modelBId: string | null;
    title: string;
    type: string;
  }>(
    `
      SELECT
        id,
        title,
        created_at as createdAt,
        type,
        model_a_id as modelAId,
        model_b_id as modelBId
      FROM chat_sessions
      WHERE id = ? AND user_id = ?
    `,
    id,
    userId,
  );

  if (!sessionRow) {
    return null;
  }

  const messageRows = await db.all<
    Array<{
      content: string;
      id: string;
      idx: number;
      role: Message['role'];
      side: string;
    }>
  >(
    `
      SELECT id, side, role, content, idx
      FROM chat_messages
      WHERE session_id = ?
      ORDER BY idx ASC
    `,
    id,
  );

  const messagesA: Message[] = [];
  const messagesB: Message[] = [];

  for (const row of messageRows) {
    const message: Message = {
      id: row.id,
      role: row.role,
      content: row.content,
    };

    if (row.side === 'A') {
      messagesA.push(message);
    } else if (row.side === 'B') {
      messagesB.push(message);
    }
  }

  return {
    id: sessionRow.id,
    title: sessionRow.title,
    createdAt: sessionRow.createdAt,
    type:
      sessionRow.type === 'comparison'
        ? 'comparison'
        : sessionRow.type === 'code'
          ? 'code'
          : 'single',
    modelAId: sessionRow.modelAId,
    modelBId: sessionRow.modelBId || undefined,
    messagesA,
    messagesB,
  };
}
