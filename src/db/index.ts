import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg, { type Pool as PgPool, type PoolConfig } from 'pg';
import * as schema from './schema.ts';

const { Pool } = pg;

declare global {
  var _postgresPool: PgPool | undefined;
  var _postgresPoolHostKey: string | undefined;
}

export interface DatabaseConfigDiagnostics {
  configured: boolean;
  mode: 'connection_url' | 'discrete_sql_vars' | 'missing';
  invalidCloudSqlSocketOnVercel: boolean;
}

function getConnectionUrlFromEnv(): string {
  const candidates = [
    process.env.DATABASE_URL,
    process.env.POSTGRES_URL,
    process.env.SUPABASE_DB_URL,
    process.env.POSTGRES_PRISMA_URL,
  ];
  for (const raw of candidates) {
    const trimmed = raw?.trim().replace(/^['"]+|['"]+$/g, '');
    if (trimmed && /^postgres(ql)?:\/\//i.test(trimmed)) {
      return trimmed;
    }
  }
  return '';
}

export function getDatabaseDiagnostics(): DatabaseConfigDiagnostics {
  const connectionUrl = getConnectionUrlFromEnv();
  if (connectionUrl) {
    return {
      configured: true,
      mode: 'connection_url',
      invalidCloudSqlSocketOnVercel: false,
    };
  }

  const sqlHost = process.env.SQL_HOST?.trim() || '';
  const sqlUser = process.env.SQL_USER?.trim() || '';
  const sqlDbName = process.env.SQL_DB_NAME?.trim() || '';
  const isVercel = Boolean(process.env.VERCEL);

  if (sqlHost && sqlUser && sqlDbName) {
    const isCloudSqlUnixSocket = sqlHost.startsWith('/cloudsql/');
    return {
      configured: !(isVercel && isCloudSqlUnixSocket),
      mode: 'discrete_sql_vars',
      invalidCloudSqlSocketOnVercel: isVercel && isCloudSqlUnixSocket,
    };
  }

  return {
    configured: false,
    mode: 'missing',
    invalidCloudSqlSocketOnVercel: false,
  };
}

export function isDatabaseConfigured(): boolean {
  return getDatabaseDiagnostics().configured;
}

const CLOUD_MANAGED_HOST_PATTERN =
  /\.(supabase\.(co|com)|pooler\.supabase\.com|neon\.tech|vercel-storage\.com|aivencloud\.com|railway\.app|render\.com|amazonaws\.com)$/i;

function resolveSslOption(
  hostHint: string | undefined,
  sslModeFromUrl?: string
): PoolConfig['ssl'] {
  if (!hostHint || hostHint.startsWith('/')) {
    // Cloud SQL Auth Proxy Unix domain socket (/cloudsql/...) never uses TLS
    return undefined;
  }

  const normalized = hostHint.trim().toLowerCase();
  if (process.env.SQL_SSL === 'false' || sslModeFromUrl === 'disable') {
    return undefined;
  }

  if (normalized === 'localhost' || normalized === '127.0.0.1') {
    return process.env.SQL_SSL === 'true'
      ? { rejectUnauthorized: false }
      : undefined;
  }

  if (
    process.env.SQL_SSL === 'true' ||
    (sslModeFromUrl && sslModeFromUrl !== 'disable') ||
    CLOUD_MANAGED_HOST_PATTERN.test(normalized)
  ) {
    return { rejectUnauthorized: false };
  }

  return undefined;
}

function buildPoolConfig(): { config: PoolConfig; cacheKey: string } {
  const isServerless = Boolean(process.env.VERCEL);
  const maxConnections = isServerless ? 3 : 10;
  const connectionUrl = getConnectionUrlFromEnv();

  if (connectionUrl) {
    let sanitizedUrl = connectionUrl;
    let parsedHost = '';
    let sslMode = '';

    try {
      const u = new URL(connectionUrl);
      parsedHost = u.hostname;
      sslMode = (u.searchParams.get('sslmode') || '').toLowerCase();
      // Remove sslmode from query string when we explicitly pass ssl: { rejectUnauthorized: false }
      // so pg@8 does not override rejectUnauthorized with strict CA verification on Supabase poolers
      if (
        sslMode === 'require' ||
        sslMode === 'prefer' ||
        sslMode === 'no-verify' ||
        CLOUD_MANAGED_HOST_PATTERN.test(parsedHost)
      ) {
        u.searchParams.delete('sslmode');
        u.searchParams.delete('uselibpqcompat');
        sanitizedUrl = u.toString();
      }
    } catch {
      // Keep original connection string if URL parsing encounters non-standard characters
    }

    const ssl = resolveSslOption(parsedHost, sslMode || 'require');
    return {
      cacheKey: `url:${parsedHost}:${Boolean(ssl)}:${maxConnections}`,
      config: {
        connectionString: sanitizedUrl,
        ssl,
        max: maxConnections,
        idleTimeoutMillis: 15000,
        connectionTimeoutMillis: 8000,
      },
    };
  }

  const sqlHost = process.env.SQL_HOST?.trim();
  const port = process.env.SQL_PORT ? Number(process.env.SQL_PORT) : 5432;
  const ssl = resolveSslOption(sqlHost);

  return {
    cacheKey: `sql:${sqlHost || ''}|${port}|${process.env.SQL_USER || ''}|${process.env.SQL_DB_NAME || ''}|${Boolean(ssl)}`,
    config: {
      host: sqlHost,
      port: Number.isFinite(port) ? port : 5432,
      user: process.env.SQL_USER?.trim(),
      password: process.env.SQL_PASSWORD,
      database: process.env.SQL_DB_NAME?.trim(),
      ssl,
      max: maxConnections,
      idleTimeoutMillis: 15000,
      connectionTimeoutMillis: 8000,
    },
  };
}

export function sanitizeSecretErrorText(raw: string): string {
  return raw
    .replace(/postgres(?:ql)?:\/\/[^\s'"]+/gi, 'postgresql://[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
    .replace(/(password\s*=\s*)[^\s&'"]+/gi, '$1[REDACTED]');
}

export function extractPgErrorCode(err: unknown): string {
  if (!err || typeof err !== 'object') {
    return '';
  }
  const obj = err as { code?: unknown; cause?: unknown };
  if (typeof obj.code === 'string' && obj.code) {
    return obj.code;
  }
  if (obj.cause && obj.cause !== err) {
    return extractPgErrorCode(obj.cause);
  }
  return '';
}

export const createPool = (): PgPool => {
  const { config, cacheKey } = buildPoolConfig();

  if (!global._postgresPool || global._postgresPoolHostKey !== cacheKey) {
    if (process.env.NODE_ENV !== 'production' && !isDatabaseConfigured()) {
      console.warn(
        '[WorkshopTrack DB Debug] Variabel environment DATABASE_URL atau SQL_HOST/SQL_USER/SQL_DB_NAME belum lengkap.'
      );
    }

    global._postgresPool = new Pool(config);
    global._postgresPoolHostKey = cacheKey;

    global._postgresPool.on('error', (err) => {
      console.error(
        '[WorkshopTrack DB] Gangguan koneksi idle pada pool PostgreSQL:',
        err instanceof Error
          ? sanitizeSecretErrorText(err.message)
          : 'Unknown pool error'
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
