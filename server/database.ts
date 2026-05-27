import pg from "pg";
import type { QueryResult, QueryResultRow } from "pg";

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL?.trim();
const isLocalDatabase = databaseUrl?.includes("localhost") || databaseUrl?.includes("127.0.0.1");

let pool: pg.Pool | null = null;
let readyPromise: Promise<void> | null = null;

function getPool() {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured");
  }

  pool ??= new Pool({
    connectionString: databaseUrl,
    ssl: isLocalDatabase ? undefined : { rejectUnauthorized: false },
  });

  return pool;
}

async function ensureTable() {
  if (!databaseUrl) {
    return;
  }

  readyPromise ??= getPool()
    .query(`
      CREATE TABLE IF NOT EXISTS app_kv (
        key text PRIMARY KEY,
        value jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    .then(() => undefined);

  await readyPromise;
}

export function isDatabaseEnabled() {
  return Boolean(databaseUrl);
}

export function getStorageMode() {
  return isDatabaseEnabled() ? "postgres" : "file";
}

export async function readDbJson<T>(key: string): Promise<T | null> {
  await ensureTable();
  const result = await getPool().query<{ value: T }>("SELECT value FROM app_kv WHERE key = $1", [key]);
  return result.rows[0]?.value ?? null;
}

export async function writeDbJson(key: string, value: unknown): Promise<void> {
  await ensureTable();
  await getPool().query(
    `
      INSERT INTO app_kv (key, value, updated_at)
      VALUES ($1, $2::jsonb, now())
      ON CONFLICT (key)
      DO UPDATE SET value = EXCLUDED.value, updated_at = now()
    `,
    [key, JSON.stringify(value)],
  );
}

export async function queryDb<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<QueryResult<T>> {
  await ensureTable();
  return getPool().query<T>(sql, params);
}
