import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import * as dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface AuthenticatedSocket extends WebSocket {
  uid?: string;
  isAuthenticated?: boolean;
}

const app = express();
const server = http.createServer(app);
const PORT = 3000;

// Use noServer: true so /ws never aborts Vite HMR WebSocket upgrades on the same HTTP server
const wss = new WebSocketServer({ noServer: true });

const broadcastSync = (event: string, entityId?: string | number) => {
  const payload = JSON.stringify({
    type: 'workshop:sync',
    event,
    entityId: entityId !== undefined ? String(entityId) : undefined,
    timestamp: Date.now(),
  });
  for (const client of wss.clients) {
    const authClient = client as AuthenticatedSocket;
    if (authClient.readyState === WebSocket.OPEN && authClient.isAuthenticated) {
      authClient.send(payload);
    }
  }
};

// Asynchronously load backend routes & Firebase Admin so port 3000 listens immediately (<200ms)
const backendModulePromise = import('./src/server-routes.ts').then((mod) => ({
  router: mod.createApiRouter(broadcastSync),
  verifyWsToken: mod.verifyWsToken,
}));

server.on('upgrade', (req, socket, head) => {
  const pathname = req.url?.split('?')[0];
  if (pathname === '/ws') {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  }
});

wss.on('connection', (ws: AuthenticatedSocket) => {
  ws.isAuthenticated = false;

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg?.type === 'auth' && typeof msg.token === 'string') {
        const { verifyWsToken } = await backendModulePromise;
        ws.uid = await verifyWsToken(msg.token);
        ws.isAuthenticated = true;
        ws.send(JSON.stringify({ type: 'auth:ok', timestamp: Date.now() }));
      }
    } catch {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'auth:error' }));
      }
    }
  });
});

app.use(express.json({ limit: '25mb' }));

// Delegate all /api/* requests once backend module finishes loading
app.use('/api', async (req, res, next) => {
  try {
    const { router } = await backendModulePromise;
    router(req, res, next);
  } catch (err) {
    next(err);
  }
});

if (process.env.NODE_ENV !== 'production') {
  const hmrDisabled = process.env.DISABLE_HMR === 'true';
  const vitePromise = import('vite').then(({ createServer: createViteServer }) =>
    createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: hmrDisabled ? false : { overlay: false },
        ws: { server },
      },
      appType: 'spa',
    })
  );

  app.use(async (req, res, next) => {
    try {
      const vite = await vitePromise;
      vite.middlewares(req, res, next);
    } catch (err) {
      next(err);
    }
  });
} else {
  const distPath = path.join(__dirname, 'dist');
  app.use(express.static(distPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Listen immediately so cold-start readiness checks succeed without waiting for Vite pre-bundling
server.listen(PORT, '0.0.0.0', () => {
  console.log(`WorkshopTrack server listening on http://0.0.0.0:${PORT}`);
});
