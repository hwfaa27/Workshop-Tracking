import type { IncomingMessage, ServerResponse } from 'node:http';
import dotenv from 'dotenv';
import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import { sanitizeSecretErrorText } from './db/index.ts';
import { createApiRouter } from './server-routes.ts';

try {
  dotenv.config({ quiet: true });
} catch {
  // Ignore missing .env in read-only serverless filesystems (/var/task)
}

/**
 * Restores the original `/api/...` route path when Vercel rewrites
 * `/api/(.*)` -> `/api/index?__path=$1`, while preserving user query params.
 */
export function normalizeVercelRequestUrl(req: IncomingMessage): void {
  const rawUrl = req.url || '/';
  try {
    const parsed = new URL(rawUrl, 'http://localhost');
    const rewrittenSubpath = parsed.searchParams.get('__path');

    if (rewrittenSubpath !== null) {
      parsed.searchParams.delete('__path');
      const cleanSubpath = rewrittenSubpath.replace(/^\/+/, '');
      if (
        parsed.pathname === '/api/index' ||
        parsed.pathname === '/api/index.js' ||
        parsed.pathname === '/index'
      ) {
        parsed.pathname = cleanSubpath ? `/api/${cleanSubpath}` : '/api';
      }
      const search = parsed.searchParams.toString();
      req.url = search ? `${parsed.pathname}?${search}` : parsed.pathname;
      return;
    }

    if (
      parsed.pathname === '/api/index' ||
      parsed.pathname === '/api/index.js'
    ) {
      const matchedHeader = req.headers['x-matched-path'];
      if (
        typeof matchedHeader === 'string' &&
        matchedHeader.startsWith('/api/') &&
        matchedHeader !== '/api/index'
      ) {
        const search = parsed.searchParams.toString();
        req.url = search ? `${matchedHeader}?${search}` : matchedHeader;
      }
    }
  } catch {
    // Keep original req.url if URL parsing fails
  }
}

let cachedExpressApp: Express | null = null;

function getOrCreateExpressApp(): Express {
  if (cachedExpressApp) {
    return cachedExpressApp;
  }

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '25mb' }));

  const apiRouter = createApiRouter(() => {});

  // Support both preserved (/api/*) and stripped (/*) paths under Vercel rewrites
  app.use('/api', apiRouter);
  app.use('/', apiRouter);

  // Global JSON error handler so Vercel serverless functions never emit HTML or plain-text crashes
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) {
      return;
    }
    const statusObj = err as {
      status?: number;
      statusCode?: number;
      type?: string;
    };
    const status = statusObj?.status || statusObj?.statusCode || 500;

    if (status === 413 || statusObj?.type === 'entity.too.large') {
      res.status(413).json({
        error:
          'Ukuran lampiran foto atau payload melebihi batas maksimum server.',
        code: 'PAYLOAD_TOO_LARGE',
      });
      return;
    }

    if (err instanceof SyntaxError && status === 400) {
      res.status(400).json({
        error: 'Format JSON permintaan tidak valid.',
        code: 'INVALID_JSON_BODY',
      });
      return;
    }

    console.error(
      '[WorkshopTrack Serverless Error]',
      err instanceof Error
        ? sanitizeSecretErrorText(err.message)
        : 'Unexpected serverless error'
    );

    res.status(status >= 400 && status < 600 ? status : 500).json({
      error: 'Terjadi gangguan internal pada layanan API WorkshopTrack.',
      code: 'SERVERLESS_RUNTIME_ERROR',
    });
  });

  cachedExpressApp = app;
  return app;
}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  try {
    normalizeVercelRequestUrl(req);
    const app = getOrCreateExpressApp();

    await new Promise<void>((resolve) => {
      let settled = false;
      const done = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };

      res.on('finish', done);
      res.on('close', done);

      app(
        req as unknown as Request,
        res as unknown as Response,
        (err?: unknown) => {
          if (!res.headersSent) {
            res.statusCode = err ? 500 : 404;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(
              JSON.stringify(
                err
                  ? {
                      error:
                        'Terjadi kesalahan pada pemrosesan permintaan API.',
                      code: 'EXPRESS_UNHANDLED_NEXT',
                    }
                  : {
                      error: `Endpoint API "${req.url || '/'}" tidak ditemukan.`,
                      code: 'API_NOT_FOUND',
                    }
              )
            );
          }
          done();
        }
      );
    });
  } catch (fatalErr) {
    console.error(
      '[WorkshopTrack Fatal Serverless Handler Error]',
      fatalErr instanceof Error
        ? sanitizeSecretErrorText(fatalErr.message)
        : 'Unknown fatal error'
    );
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(
        JSON.stringify({
          error:
            'Layanan backend API gagal diinisialisasi. Pastikan Environment Variables database (DATABASE_URL atau SQL_HOST, SQL_PORT, SQL_USER, SQL_PASSWORD, SQL_DB_NAME, SQL_SSL) dan FIREBASE_PROJECT_ID telah diatur pada Vercel.',
          code: 'SERVERLESS_INIT_FAILED',
        })
      );
    }
  }
}
