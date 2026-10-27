import { Router, Response } from 'express';
import { adminAuth } from './lib/firebase-admin.ts';
import { AuthRequest, requireAuth, requireRoles } from './middleware/auth.ts';
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
  if (error instanceof HttpError) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }
  const message = error instanceof Error ? error.message : defaultMessage;
  console.error(defaultMessage, error);
  res.status(500).json({ error: message || defaultMessage });
}

export async function verifyWsToken(token: string): Promise<string> {
  const decoded = await adminAuth.verifyIdToken(token);
  return decoded.uid;
}

export function createApiRouter(
  broadcastSync: (event: string, entityId?: string | number) => void
): Router {
  const router = Router();

  // --- AUTH & PROFILE ---
  router.get('/auth/me', requireAuth, async (req: AuthRequest, res) => {
    res.json({ user: req.dbUser });
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

  return router;
}
