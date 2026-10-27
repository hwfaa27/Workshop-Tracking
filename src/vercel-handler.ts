import type { IncomingMessage, ServerResponse } from 'node:http';
import dotenv from 'dotenv';
import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import { createApiRouter } from './server-routes.ts';

dotenv.config({ quiet: true });

let cachedExpressApp: Express | null = null;

function getOrCreateExpressApp(): Express {
  if (cachedExpressApp) {
    return cachedExpressApp;
  }

  const app = express();
  app.disable('x-powered-by');
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
      err instanceof Error ? err.message : 'Unexpected serverless error'
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
    const app = getOrCreateExpressApp();
    await new Promise<void>((resolve) => {
      res.on('finish', resolve);
      res.on('close', resolve);
      app(
        req as unknown as Request,
        res as unknown as Response,
        (err?: unknown) => {
          if (err && !res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(
              JSON.stringify({
                error: 'Terjadi kesalahan pada pemrosesan permintaan API.',
                code: 'EXPRESS_UNHANDLED_NEXT',
              })
            );
          }
          resolve();
        }
      );
    });
  } catch (fatalErr) {
    console.error(
      '[WorkshopTrack Fatal Serverless Handler Error]',
      fatalErr instanceof Error ? fatalErr.message : 'Unknown fatal error'
    );
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(
        JSON.stringify({
          error:
            'Layanan backend API gagal diinisialisasi. Pastikan Environment Variables database (SQL_HOST, SQL_PORT, SQL_USER, SQL_PASSWORD, SQL_DB_NAME, SQL_SSL) telah diatur dengan benar.',
          code: 'SERVERLESS_INIT_FAILED',
        })
      );
    }
  }
}
