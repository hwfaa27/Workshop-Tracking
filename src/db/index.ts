import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg, { type Pool as PgPool } from 'pg';
import * as schema from './schema.ts';

const { Pool } = pg;

declare global {
  var _postgresPool: PgPool | undefined;
  var _postgresPoolHostKey: string | undefined;
}

export function isDatabaseConfigured(): boolean {
  return Boolean(
    process.env.SQL_HOST?.trim() &&
      process.env.SQL_USER?.trim() &&
      process.env.SQL_DB_NAME?.trim()
  );
}

function resolveSslOption(sqlHost: string | undefined) {
  if (!sqlHost || sqlHost.startsWith('/')) {
    // Cloud SQL Auth Proxy Unix domain socket (/cloudsql/...) never uses TLS
    return undefined;
  }
  const normalized = sqlHost.trim().toLowerCase();
  if (normalized === 'localhost' || normalized === '127.0.0.1') {
    return process.env.SQL_SSL === 'true'
      ? { rejectUnauthorized: false }
      : undefined;
  }
  if (process.env.SQL_SSL === 'false') {
    return undefined;
  }
  if (
    process.env.SQL_SSL === 'true' ||
    /\.(supabase\.(co|com)|neon\.tech|aivencloud\.com|railway\.app|render\.com)$/i.test(
      normalized
    )
  ) {
    return { rejectUnauthorized: false };
  }
  return undefined;
}

export const createPool = (): PgPool => {
  const sqlHost = process.env.SQL_HOST?.trim();
  const hostKey = `${sqlHost || ''}|${process.env.SQL_USER || ''}|${process.env.SQL_DB_NAME || ''}`;

  if (!global._postgresPool || global._postgresPoolHostKey !== hostKey) {
    if (process.env.NODE_ENV !== 'production' && !isDatabaseConfigured()) {
      console.warn(
        '[WorkshopTrack DB Debug] Variabel environment SQL_HOST / SQL_USER / SQL_DB_NAME belum lengkap.'
      );
    }

    global._postgresPool = new Pool({
      host: sqlHost,
      port: process.env.SQL_PORT ? Number(process.env.SQL_PORT) : 5432,
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      database: process.env.SQL_DB_NAME,
      ssl: resolveSslOption(sqlHost),
      max: 10,
      connectionTimeoutMillis: 8000,
    });
    global._postgresPoolHostKey = hostKey;

    global._postgresPool.on('error', (err) => {
      console.error(
        '[WorkshopTrack DB] Gangguan koneksi idle pada pool PostgreSQL:',
        err instanceof Error ? err.message : 'Unknown pool error'
      );
    });
  }
  return global._postgresPool;
};

let cachedDb: NodePgDatabase<typeof schema> | undefined;
let cachedDbKey: string | undefined;

function getDrizzleDb(): NodePgDatabase<typeof schema> {
  const pool = createPool();
  if (!cachedDb || cachedDbKey !== global._postgresPoolHostKey) {
    cachedDb = drizzle(pool, { schema });
    cachedDbKey = global._postgresPoolHostKey;
  }
  return cachedDb;
}

export const db = new Proxy({} as NodePgDatabase<typeof schema>, {
  get(_target, prop, receiver) {
    const activeDb = getDrizzleDb();
    const value = Reflect.get(activeDb, prop, receiver);
    return typeof value === 'function' ? value.bind(activeDb) : value;
  },
});
