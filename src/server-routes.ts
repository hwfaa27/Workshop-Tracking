import express, { type Response, type Router } from 'express';
import { adminAuth, resolveServerFirebaseProjectId } from './lib/firebase-admin.ts';
import {
  getDatabaseDiagnostics,
  isDatabaseConfigured,
  sanitizeSecretErrorText,
} from './db/index.ts';
import {
  type AuthRequest,
  clearSessionCookie,
  requireAuth,
  requireRoles,
  setSessionCookie,
} from './middleware/auth.ts';
import {
  approveItemStage,
  assignTechniciansToItem,
  createCustomer,
  createDailyWorkActivity,
  createEmployeeAccount,
  createLocation,
  createWorkOrderWithItems,
  getDashboardData,
  getFullReportsBundle,
  getItemDetail,
  HttpError,
  listCustomers,
  listItems,
  listLocations,
  listNotificationsForUser,
  listUsers,
  listWorkOrders,
  markNotificationsRead,
  moveItemLocation,
  performQuickScanUpdate,
  recordQrReprintAudit,
  seedOperationalSampleRecords,
  switchOwnerRole,
  updateCustomer,
  updateEmployeeAccount,
  updateItemMetadata,
  updateItemStatus,
  updateLocation,
  updateWorkOrderPriority,
} from './db/repository.ts';

function handleApiError(res: Response, error: unknown, defaultMessage: string) {
  if (res.headersSent) {
    return;
  }
  if (error instanceof HttpError) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }
  const rawMessage = error instanceof Error ? error.message : defaultMessage;
  const safeLogMessage = sanitizeSecretErrorText(rawMessage);
  console.error('[WorkshopTrack API Error]', defaultMessage, safeLogMessage);

  const isRawJsonSyntaxError =
    error instanceof SyntaxError ||
    rawMessage.includes('is not valid JSON') ||
    rawMessage.includes('Unexpected token');

  res.status(500).json({
    error: isRawJsonSyntaxError ? defaultMessage : safeLogMessage || defaultMessage,
    code: 'API_INTERNAL_ERROR',
  });
}

export async function verifyWsToken(token: string): Promise<string> {
  const decoded = await adminAuth.verifyIdToken(token);
  return decoded.uid;
}

export function createApiRouter(
  broadcastSync: (event: string, entityId?: string | number) => void
): Router {
  const router = express.Router();

  // --- DIAGNOSTIC HEALTH CHECK (JSON ONLY, NO SECRETS) ---
  router.get('/health', (_req, res) => {
    const dbDiag = getDatabaseDiagnostics();
    const dbReady = isDatabaseConfigured();
    const firebaseReady = Boolean(resolveServerFirebaseProjectId());
    res.status(dbReady && firebaseReady ? 200 : 503).json({
      ok: dbReady && firebaseReady,
      service: 'WorkshopTrack API',
      databaseConfigured: dbReady,
      databaseMode: dbDiag.mode,
      firebaseProjectConfigured: firebaseReady,
      runtime: process.env.VERCEL ? 'vercel-serverless' : 'node-server',
      timestamp: new Date().toISOString(),
    });
  });

  // --- AUTH & PROFILE ---
  router.get('/auth/me', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.dbUser) {
        res.status(401).json({
          authenticated: false,
          user: null,
          error: 'Sesi tidak ditemukan. Silakan login terlebih dahulu.',
          code: 'AUTH_MISSING_USER',
        });
        return;
      }

      if (req.authToken && req.authSource === 'bearer') {
        setSessionCookie(req, res, req.authToken);
      }

      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.status(200).json({
        authenticated: true,
        user: req.dbUser,
      });
    } catch (error) {
      handleApiError(res, error, 'Gagal memuat sesi profil pengguna.');
    }
  });

  router.post('/auth/logout', (req, res) => {
    clearSessionCookie(req, res);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.status(200).json({ ok: true, authenticated: false });
  });

  router.post('/auth/self-role', requireAuth, async (req: AuthRequest, res) => {
    try {
      const updated = await switchOwnerRole(req.dbUser!, req.body.role);
      broadcastSync('user:updated', updated.id);
      res.json({ user: updated });
    } catch (error) {
      handleApiError(res, error, 'Gagal mengganti peran aktif.');
    }
  });

  // --- USERS / EMPLOYEE ACCOUNTS ---
  router.get('/users', requireAuth, async (_req: AuthRequest, res) => {
    try {
      const data = await listUsers();
      res.json({ users: data });
    } catch (error) {
      handleApiError(res, error, 'Gagal memuat daftar karyawan.');
    }
  });

  router.post(
    '/users',
    requireAuth,
    requireRoles(['ADMIN']),
    async (req: AuthRequest, res) => {
      try {
        const created = await createEmployeeAccount(req.dbUser!, req.body);
        broadcastSync('user:created', created.id);
        res.status(201).json({ user: created });
      } catch (error) {
        handleApiError(res, error, 'Gagal menambahkan akun karyawan.');
      }
    }
  );

  router.patch(
    '/users/:id',
    requireAuth,
    requireRoles(['ADMIN']),
    async (req: AuthRequest, res) => {
      try {
        const updated = await updateEmployeeAccount(
          req.dbUser!,
          Number(req.params.id),
          req.body
        );
        broadcastSync('user:updated', updated.id);
        res.json({ user: updated });
      } catch (error) {
        handleApiError(res, error, 'Gagal memperbarui akun karyawan.');
      }
    }
  );

  // --- CUSTOMERS ---
  router.get('/customers', requireAuth, async (_req: AuthRequest, res) => {
    try {
      const data = await listCustomers();
      res.json({ customers: data });
    } catch (error) {
      handleApiError(res, error, 'Gagal memuat data customer.');
    }
  });

  router.post(
    '/customers',
    requireAuth,
    requireRoles(['ADMIN']),
    async (req: AuthRequest, res) => {
      try {
        const created = await createCustomer(req.dbUser!, req.body);
        broadcastSync('customer:created', created.id);
        res.status(201).json({ customer: created });
      } catch (error) {
        handleApiError(res, error, 'Gagal menyimpan customer.');
      }
    }
  );

  router.patch(
    '/customers/:id',
    requireAuth,
    requireRoles(['ADMIN']),
    async (req: AuthRequest, res) => {
      try {
        const updated = await updateCustomer(
          req.dbUser!,
          Number(req.params.id),
          req.body
        );
        broadcastSync('customer:updated', updated.id);
        res.json({ customer: updated });
      } catch (error) {
        handleApiError(res, error, 'Gagal memperbarui customer.');
      }
    }
  );

  // --- WORKSHOP LOCATIONS ---
  router.get('/locations', requireAuth, async (req: AuthRequest, res) => {
    try {
      const includeInactive = req.query.activeOnly !== 'true';
      const data = await listLocations(includeInactive);
      res.json({ locations: data });
    } catch (error) {
      handleApiError(res, error, 'Gagal memuat lokasi workshop.');
    }
  });

  router.post(
    '/locations',
    requireAuth,
    requireRoles(['ADMIN']),
    async (req: AuthRequest, res) => {
      try {
        const created = await createLocation(req.dbUser!, req.body);
        broadcastSync('location:created', created.id);
        res.status(201).json({ location: created });
      } catch (error) {
        handleApiError(res, error, 'Gagal menambahkan lokasi.');
      }
    }
  );

  router.patch(
    '/locations/:id',
    requireAuth,
    requireRoles(['ADMIN']),
    async (req: AuthRequest, res) => {
      try {
        const updated = await updateLocation(
          req.dbUser!,
          Number(req.params.id),
          req.body
        );
        broadcastSync('location:updated', updated.id);
        res.json({ location: updated });
      } catch (error) {
        handleApiError(res, error, 'Gagal memperbarui lokasi.');
      }
    }
  );

  // --- WORK ORDERS & INCOMING GOODS ---
  router.get('/work-orders', requireAuth, async (_req: AuthRequest, res) => {
    try {
      const data = await listWorkOrders();
      res.json({ workOrders: data });
    } catch (error) {
      handleApiError(res, error, 'Gagal memuat Work Order.');
    }
  });

  router.post(
    '/work-orders',
    requireAuth,
    requireRoles(['ADMIN']),
    async (req: AuthRequest, res) => {
      try {
        const created = await createWorkOrderWithItems(req.dbUser!, req.body);
        broadcastSync('workorder:created', created.id);
        res.status(201).json({ workOrder: created });
      } catch (error) {
        handleApiError(res, error, 'Gagal mendaftarkan penerimaan barang.');
      }
    }
  );

  router.patch(
    '/work-orders/:id/priority',
    requireAuth,
    requireRoles(['ADMIN', 'SUPERVISOR']),
    async (req: AuthRequest, res) => {
      try {
        await updateWorkOrderPriority(
          req.dbUser!,
          Number(req.params.id),
          req.body.priority,
          req.body.estimatedCompletion
        );
        broadcastSync('workorder:updated', req.params.id);
        res.json({ ok: true });
      } catch (error) {
        handleApiError(res, error, 'Gagal memperbarui prioritas Work Order.');
      }
    }
  );

  // --- ITEMS, QR LOOKUP, STATUS, LOCATION, TECHNICIAN, DAILY PROGRESS ---
  router.get('/items', requireAuth, async (_req: AuthRequest, res) => {
    try {
      const data = await listItems();
      res.json({ items: data });
    } catch (error) {
      handleApiError(res, error, 'Gagal memuat daftar barang.');
    }
  });

  router.get('/items/:identifier', requireAuth, async (req: AuthRequest, res) => {
    try {
      const detail = await getItemDetail(String(req.params.identifier));
      res.json({ item: detail });
    } catch (error) {
      handleApiError(res, error, 'Gagal memuat detail barang.');
    }
  });

  router.patch(
    '/items/:id',
    requireAuth,
    requireRoles(['ADMIN']),
    async (req: AuthRequest, res) => {
      try {
        const updated = await updateItemMetadata(
          req.dbUser!,
          Number(req.params.id),
          req.body
        );
        broadcastSync('item:updated', updated.id);
        res.json({ item: updated });
      } catch (error) {
        handleApiError(res, error, 'Gagal mengubah informasi barang.');
      }
    }
  );

  router.post(
    '/items/:id/status',
    requireAuth,
    requireRoles(['ADMIN', 'SUPERVISOR', 'TEKNISI']),
    async (req: AuthRequest, res) => {
      try {
        const updated = await updateItemStatus(
          req.dbUser!,
          Number(req.params.id),
          req.body
        );
        broadcastSync('item:updated', updated.id);
        res.json({ item: updated });
      } catch (error) {
        handleApiError(res, error, 'Gagal memperbarui status pengerjaan.');
      }
    }
  );

  router.post(
    '/items/:id/move',
    requireAuth,
    requireRoles(['ADMIN', 'SUPERVISOR', 'TEKNISI']),
    async (req: AuthRequest, res) => {
      try {
        const updated = await moveItemLocation(
          req.dbUser!,
          Number(req.params.id),
          req.body
        );
        broadcastSync('item:updated', updated.id);
        res.json({ item: updated });
      } catch (error) {
        handleApiError(res, error, 'Gagal memindahkan lokasi barang.');
      }
    }
  );

  router.post(
    '/items/:id/quick-scan-update',
    requireAuth,
    requireRoles(['ADMIN', 'SUPERVISOR', 'TEKNISI']),
    async (req: AuthRequest, res) => {
      try {
        const updated = await performQuickScanUpdate(
          req.dbUser!,
          Number(req.params.id),
          req.body
        );
        broadcastSync('item:updated', updated.id);
        res.json({ item: updated });
      } catch (error) {
        handleApiError(res, error, 'Gagal menyimpan pembaruan cepat QR.');
      }
    }
  );

  router.post(
    '/items/:id/assign',
    requireAuth,
    requireRoles(['ADMIN', 'SUPERVISOR']),
    async (req: AuthRequest, res) => {
      try {
        const updated = await assignTechniciansToItem(
          req.dbUser!,
          Number(req.params.id),
          req.body
        );
        broadcastSync('item:updated', updated.id);
        res.json({ item: updated });
      } catch (error) {
        handleApiError(res, error, 'Gagal menugaskan teknisi.');
      }
    }
  );

  router.post(
    '/items/:id/activities',
    requireAuth,
    requireRoles(['ADMIN', 'SUPERVISOR', 'TEKNISI']),
    async (req: AuthRequest, res) => {
      try {
        const updated = await createDailyWorkActivity(
          req.dbUser!,
          Number(req.params.id),
          req.body
        );
        broadcastSync('item:updated', updated.id);
        res.status(201).json({ item: updated });
      } catch (error) {
        handleApiError(res, error, 'Gagal menyimpan aktivitas pekerjaan.');
      }
    }
  );

  router.post(
    '/items/:id/approve',
    requireAuth,
    requireRoles(['ADMIN', 'SUPERVISOR']),
    async (req: AuthRequest, res) => {
      try {
        const updated = await approveItemStage(
          req.dbUser!,
          Number(req.params.id),
          req.body
        );
        broadcastSync('item:updated', updated.id);
        res.json({ item: updated });
      } catch (error) {
        handleApiError(res, error, 'Gagal menyetujui tahapan pekerjaan.');
      }
    }
  );

  router.post('/items/:id/reprint-log', requireAuth, async (req: AuthRequest, res) => {
    try {
      await recordQrReprintAudit(
        req.dbUser!,
        req.body.itemCode || String(req.params.id)
      );
      res.json({ ok: true });
    } catch (error) {
      handleApiError(res, error, 'Gagal mencatat log cetak label.');
    }
  });

  // --- DASHBOARD, NOTIFICATIONS, REPORTS & OPTIONAL ADMIN SAMPLE SEED ---
  router.get('/dashboard', requireAuth, async (req: AuthRequest, res) => {
    try {
      const data = await getDashboardData({
        startDate: req.query.startDate as string | undefined,
        endDate: req.query.endDate as string | undefined,
        customerId: req.query.customerId ? Number(req.query.customerId) : undefined,
        technicianId: req.query.technicianId
          ? Number(req.query.technicianId)
          : undefined,
        status: req.query.status as string | undefined,
        locationId: req.query.locationId ? Number(req.query.locationId) : undefined,
        componentType: req.query.componentType as string | undefined,
      });
      res.json(data);
    } catch (error) {
      handleApiError(res, error, 'Gagal memuat dashboard monitoring.');
    }
  });

  router.get('/notifications', requireAuth, async (req: AuthRequest, res) => {
    try {
      const data = await listNotificationsForUser(req.dbUser!);
      res.json({ notifications: data });
    } catch (error) {
      handleApiError(res, error, 'Gagal memuat notifikasi.');
    }
  });

  router.post('/notifications/read', requireAuth, async (req: AuthRequest, res) => {
    try {
      await markNotificationsRead(req.dbUser!, req.body.notificationId);
      res.json({ ok: true });
    } catch (error) {
      handleApiError(res, error, 'Gagal menandai notifikasi.');
    }
  });

  router.get(
    '/reports',
    requireAuth,
    requireRoles(['ADMIN', 'SUPERVISOR', 'MANAJEMEN']),
    async (_req: AuthRequest, res) => {
      try {
        const bundle = await getFullReportsBundle();
        res.json(bundle);
      } catch (error) {
        handleApiError(res, error, 'Gagal memuat paket data laporan.');
      }
    }
  );

  router.post(
    '/admin/seed-operational-sample',
    requireAuth,
    requireRoles(['ADMIN']),
    async (req: AuthRequest, res) => {
      try {
        await seedOperationalSampleRecords(req.dbUser!);
        broadcastSync('workorder:seeded');
        res.json({ ok: true });
      } catch (error) {
        handleApiError(res, error, 'Gagal memuat contoh data operasional.');
      }
    }
  );

  // Catch-all JSON 404 for unknown /api/* endpoints so HTML is never returned
  router.use((req, res) => {
    res.status(404).json({
      error: `Endpoint API "${req.originalUrl}" tidak ditemukan.`,
      code: 'API_NOT_FOUND',
    });
  });

  return router;
}
