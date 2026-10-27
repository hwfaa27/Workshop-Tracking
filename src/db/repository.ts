import crypto from 'node:crypto';
import { and, asc, desc, eq, inArray, or } from 'drizzle-orm';
import {
  createPool,
  db,
  extractPgErrorCode,
  sanitizeSecretErrorText,
} from './index.ts';
import { ensurePostgresSchema, isMissingRelationError } from './bootstrap.ts';
import {
  attachments,
  auditLogs,
  customers,
  itemLocations,
  movementHistory,
  notifications,
  repairActivities,
  statusHistory,
  technicianAssignments,
  users,
  workOrderItems,
  workOrders,
} from './schema.ts';
import {
  type AttachmentCategory,
  type AuditLogRecord,
  computeStageProgress,
  type CustomerRecord,
  type DashboardPayload,
  type ItemStatus,
  type LocationRecord,
  type NotificationRecord,
  type PriorityLevel,
  STATUS_LABELS,
  type UserProfile,
  type UserRole,
  type WorkOrderItemDetail,
  type WorkOrderItemSummary,
  type WorkOrderRecord,
} from '../types/workshop.ts';

export const OWNER_ADMIN_EMAIL = 'hwfaa270804@gmail.com';

export class HttpError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

function wrapDbError(error: unknown, fallbackMessage: string): never {
  if (error instanceof HttpError) {
    throw error;
  }
  const pgCode = extractPgErrorCode(error);
  const safeMsg =
    error instanceof Error
      ? sanitizeSecretErrorText(error.message)
      : 'Unknown database error';
  console.error(
    `[WorkshopTrack DB Error] ${fallbackMessage} (code=${pgCode || 'N/A'}): ${safeMsg}`
  );
  throw new Error(fallbackMessage, { cause: error });
}

const DEFAULT_LOCATIONS = [
  { code: 'LOC-01', name: 'Receiving Area', description: 'Area penerimaan barang masuk dan pencatatan awal Work Order', sortOrder: 1 },
  { code: 'LOC-02', name: 'Inspection Area', description: 'Area inspeksi dimensi, keretakan (NDT/penetrant), dan evaluasi kerusakan', sortOrder: 2 },
  { code: 'LOC-03', name: 'Disassembly Area', description: 'Area pembongkaran komponen mesin dan pembersihan awal', sortOrder: 3 },
  { code: 'LOC-04', name: 'Machining Area', description: 'Area pembubutan, frais, grinding, dan pemesinan presisi', sortOrder: 4 },
  { code: 'LOC-05', name: 'Line Boring Area', description: 'Area line boring housing dan bearing journal', sortOrder: 5 },
  { code: 'LOC-06', name: 'Balancing Area', description: 'Area dynamic balancing rotor, impeller, dan crankshaft', sortOrder: 6 },
  { code: 'LOC-07', name: 'Welding Area', description: 'Area pengelasan perbaikan, metalizing, dan hardfacing', sortOrder: 7 },
  { code: 'LOC-08', name: 'Assembly Area', description: 'Area perakitan ulang komponen dan kalibrasi mekanis', sortOrder: 8 },
  { code: 'LOC-09', name: 'Quality Control Area', description: 'Area pemeriksaan akhir toleransi standar dan uji kualitas', sortOrder: 9 },
  { code: 'LOC-10', name: 'Storage Area', description: 'Area penyimpanan komponen menunggu spare part atau jadwal kirim', sortOrder: 10 },
  { code: 'LOC-11', name: 'Delivery Area', description: 'Area serah terima dan pengiriman barang selesai ke customer', sortOrder: 11 },
];

export async function ensureDefaultLocations(): Promise<void> {
  try {
    const existing = await db.select().from(itemLocations).limit(1);
    if (existing.length === 0) {
      await db
        .insert(itemLocations)
        .values(
          DEFAULT_LOCATIONS.map((loc) => ({
            code: loc.code,
            name: loc.name,
            description: loc.description,
            isActive: true,
            sortOrder: loc.sortOrder,
          }))
        )
        .onConflictDoNothing();
    }
  } catch (error) {
    wrapDbError(error, 'Gagal menginisialisasi lokasi standar workshop.');
  }
}

function mapUserRow(row: typeof users.$inferSelect): UserProfile {
  return {
    id: row.id,
    uid: row.uid,
    email: row.email,
    fullName: row.fullName,
    role: row.role as UserRole,
    phone: row.phone,
    specialization: row.specialization,
    isActive: row.isActive,
    canSelfSwitchRole: row.email.toLowerCase() === OWNER_ADMIN_EMAIL.toLowerCase(),
    createdAt: row.createdAt.toISOString(),
  };
}

async function syncAuthenticatedUserInternal(
  uid: string,
  email: string,
  displayName?: string
): Promise<UserProfile> {
  const normalizedEmail = email.trim().toLowerCase();
  const fallbackName =
    displayName && displayName.trim().length > 0
      ? displayName.trim()
      : normalizedEmail.split('@')[0];

  // Check if user already exists by uid
  const byUid = await db.select().from(users).where(eq(users.uid, uid)).limit(1);
  if (byUid.length > 0) {
    return mapUserRow(byUid[0]);
  }

  // Check if pre-registered by email (e.g. Admin created staff account beforehand)
  const byEmail = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (byEmail.length > 0) {
    const updated = await db
      .update(users)
      .set({
        uid,
        fullName: byEmail[0].fullName || fallbackName,
        updatedAt: new Date(),
      })
      .where(eq(users.id, byEmail[0].id))
      .returning();
    return mapUserRow(updated[0]);
  }

  // Check if there are any admins yet
  const existingAdmins = await db
    .select()
    .from(users)
    .where(eq(users.role, 'ADMIN'))
    .limit(1);

  const initialRole: UserRole =
    existingAdmins.length === 0 || normalizedEmail === OWNER_ADMIN_EMAIL.toLowerCase()
      ? 'ADMIN'
      : 'TEKNISI';

  const inserted = await db
    .insert(users)
    .values({
      uid,
      email: normalizedEmail,
      fullName: fallbackName,
      role: initialRole,
      specialization: initialRole === 'ADMIN' ? 'Administrasi & Penerimaan' : 'Mekanik Umum',
    })
    .onConflictDoUpdate({
      target: users.uid,
      set: {
        email: normalizedEmail,
        updatedAt: new Date(),
      },
    })
    .returning();

  return mapUserRow(inserted[0]);
}

export async function syncAuthenticatedUser(
  uid: string,
  email: string,
  displayName?: string
): Promise<UserProfile> {
  try {
    return await syncAuthenticatedUserInternal(uid, email, displayName);
  } catch (error) {
    if (isMissingRelationError(error)) {
      try {
        console.info(
          '[WorkshopTrack DB Bootstrap] Tabel database belum terinisialisasi, menyiapkan skema PostgreSQL WorkshopTrack...'
        );
        await ensurePostgresSchema(createPool());
        await ensureDefaultLocations();
        return await syncAuthenticatedUserInternal(uid, email, displayName);
      } catch (bootstrapErr) {
        wrapDbError(
          bootstrapErr,
          'Gagal menginisialisasi skema tabel pengguna pada database PostgreSQL.'
        );
      }
    }
    wrapDbError(error, 'Gagal menyinkronkan profil pengguna.');
  }
}

export async function listUsers(): Promise<UserProfile[]> {
  try {
    const rows = await db.select().from(users).orderBy(asc(users.fullName));
    return rows.map(mapUserRow);
  } catch (error) {
    wrapDbError(error, 'Gagal memuat daftar karyawan.');
  }
}

export async function createEmployeeAccount(
  actor: UserProfile,
  payload: {
    email: string;
    fullName: string;
    role: UserRole;
    phone?: string;
    specialization?: string;
  }
): Promise<UserProfile> {
  try {
    const normalizedEmail = payload.email.trim().toLowerCase();
    if (!normalizedEmail || !payload.fullName.trim()) {
      throw new HttpError(400, 'Nama lengkap dan alamat email wajib diisi.');
    }

    const existing = await db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);
    if (existing.length > 0) {
      throw new HttpError(400, 'Email karyawan tersebut sudah terdaftar.');
    }

    const placeholderUid = `pending_${crypto.randomBytes(10).toString('hex')}`;
    const [created] = await db
      .insert(users)
      .values({
        uid: placeholderUid,
        email: normalizedEmail,
        fullName: payload.fullName.trim(),
        role: payload.role,
        phone: (payload.phone || '').trim(),
        specialization: (payload.specialization || 'Umum').trim(),
        isActive: true,
      })
      .returning();

    await db.insert(auditLogs).values({
      actorUserId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.role,
      action: 'CREATE_USER',
      entityType: 'users',
      entityId: String(created.id),
      details: `Menambahkan akun karyawan ${created.fullName} (${created.email}) dengan peran ${created.role}.`,
    });

    return mapUserRow(created);
  } catch (error) {
    wrapDbError(error, 'Gagal mendaftarkan akun karyawan.');
  }
}

export async function updateEmployeeAccount(
  actor: UserProfile,
  targetUserId: number,
  payload: {
    fullName?: string;
    role?: UserRole;
    phone?: string;
    specialization?: string;
    isActive?: boolean;
  }
): Promise<UserProfile> {
  try {
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.id, targetUserId))
      .limit(1);
    if (existing.length === 0) {
      throw new HttpError(404, 'Akun karyawan tidak ditemukan.');
    }

    const [updated] = await db
      .update(users)
      .set({
        fullName: payload.fullName !== undefined ? payload.fullName.trim() : existing[0].fullName,
        role: payload.role !== undefined ? payload.role : existing[0].role,
        phone: payload.phone !== undefined ? payload.phone.trim() : existing[0].phone,
        specialization:
          payload.specialization !== undefined
            ? payload.specialization.trim()
            : existing[0].specialization,
        isActive: payload.isActive !== undefined ? payload.isActive : existing[0].isActive,
        updatedAt: new Date(),
      })
      .where(eq(users.id, targetUserId))
      .returning();

    await db.insert(auditLogs).values({
      actorUserId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.role,
      action: 'UPDATE_USER',
      entityType: 'users',
      entityId: String(updated.id),
      details: `Memperbarui akun ${updated.fullName}: peran=${updated.role}, aktif=${updated.isActive}.`,
    });

    return mapUserRow(updated);
  } catch (error) {
    wrapDbError(error, 'Gagal memperbarui akun karyawan.');
  }
}

export async function switchOwnerRole(
  actor: UserProfile,
  newRole: UserRole
): Promise<UserProfile> {
  try {
    if (actor.email.toLowerCase() !== OWNER_ADMIN_EMAIL.toLowerCase() && actor.role !== 'ADMIN') {
      throw new HttpError(403, 'Hanya pemilik sistem utama atau Admin yang dapat mengubah peran pengujian.');
    }
    const [updated] = await db
      .update(users)
      .set({ role: newRole, updatedAt: new Date() })
      .where(eq(users.id, actor.id))
      .returning();

    await db.insert(auditLogs).values({
      actorUserId: actor.id,
      actorName: actor.fullName,
      actorRole: newRole,
      action: 'SWITCH_SELF_ROLE',
      entityType: 'users',
      entityId: String(actor.id),
      details: `Mengubah peran sesi aktif menjadi ${newRole}.`,
    });

    return mapUserRow(updated);
  } catch (error) {
    wrapDbError(error, 'Gagal mengubah peran aktif.');
  }
}

export async function listCustomers(): Promise<CustomerRecord[]> {
  try {
    const rows = await db
      .select()
      .from(customers)
      .orderBy(asc(customers.companyName));
    return rows.map((r) => ({
      id: r.id,
      customerCode: r.customerCode,
      contactName: r.contactName,
      companyName: r.companyName,
      phone: r.phone,
      email: r.email,
      address: r.address,
      createdAt: r.createdAt.toISOString(),
    }));
  } catch (error) {
    wrapDbError(error, 'Gagal memuat data customer.');
  }
}

export async function createCustomer(
  actor: UserProfile,
  payload: {
    contactName: string;
    companyName: string;
    phone?: string;
    email?: string;
    address?: string;
  }
): Promise<CustomerRecord> {
  try {
    if (!payload.contactName.trim() || !payload.companyName.trim()) {
      throw new HttpError(400, 'Nama PIC customer dan nama perusahaan wajib diisi.');
    }

    const lastCustomer = await db
      .select()
      .from(customers)
      .orderBy(desc(customers.id))
      .limit(1);
    const nextNum = lastCustomer.length > 0 ? lastCustomer[0].id + 1 : 1;
    const customerCode = `CUST-${String(nextNum).padStart(4, '0')}`;

    const [created] = await db
      .insert(customers)
      .values({
        customerCode,
        contactName: payload.contactName.trim(),
        companyName: payload.companyName.trim(),
        phone: (payload.phone || '').trim(),
        email: (payload.email || '').trim(),
        address: (payload.address || '').trim(),
      })
      .returning();

    await db.insert(auditLogs).values({
      actorUserId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.role,
      action: 'CREATE_CUSTOMER',
      entityType: 'customers',
      entityId: String(created.id),
      details: `Menambahkan customer ${created.companyName} (${created.contactName}).`,
    });

    return {
      id: created.id,
      customerCode: created.customerCode,
      contactName: created.contactName,
      companyName: created.companyName,
      phone: created.phone,
      email: created.email,
      address: created.address,
      createdAt: created.createdAt.toISOString(),
    };
  } catch (error) {
    wrapDbError(error, 'Gagal menyimpan data customer.');
  }
}

export async function updateCustomer(
  actor: UserProfile,
  customerId: number,
  payload: {
    contactName: string;
    companyName: string;
    phone?: string;
    email?: string;
    address?: string;
  }
): Promise<CustomerRecord> {
  try {
    const [updated] = await db
      .update(customers)
      .set({
        contactName: payload.contactName.trim(),
        companyName: payload.companyName.trim(),
        phone: (payload.phone || '').trim(),
        email: (payload.email || '').trim(),
        address: (payload.address || '').trim(),
      })
      .where(eq(customers.id, customerId))
      .returning();

    if (!updated) {
      throw new HttpError(404, 'Customer tidak ditemukan.');
    }

    await db.insert(auditLogs).values({
      actorUserId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.role,
      action: 'UPDATE_CUSTOMER',
      entityType: 'customers',
      entityId: String(updated.id),
      details: `Memperbarui data customer ${updated.companyName}.`,
    });

    return {
      id: updated.id,
      customerCode: updated.customerCode,
      contactName: updated.contactName,
      companyName: updated.companyName,
      phone: updated.phone,
      email: updated.email,
      address: updated.address,
      createdAt: updated.createdAt.toISOString(),
    };
  } catch (error) {
    wrapDbError(error, 'Gagal memperbarui data customer.');
  }
}

export async function listLocations(includeInactive = true): Promise<LocationRecord[]> {
  try {
    await ensureDefaultLocations();
    const rows = includeInactive
      ? await db.select().from(itemLocations).orderBy(asc(itemLocations.sortOrder), asc(itemLocations.id))
      : await db
          .select()
          .from(itemLocations)
          .where(eq(itemLocations.isActive, true))
          .orderBy(asc(itemLocations.sortOrder), asc(itemLocations.id));

    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      description: r.description,
      isActive: r.isActive,
      sortOrder: r.sortOrder,
    }));
  } catch (error) {
    wrapDbError(error, 'Gagal memuat daftar lokasi workshop.');
  }
}

export async function createLocation(
  actor: UserProfile,
  payload: { name: string; description?: string; sortOrder?: number }
): Promise<LocationRecord> {
  try {
    if (!payload.name.trim()) {
      throw new HttpError(400, 'Nama lokasi wajib diisi.');
    }
    const all = await db.select().from(itemLocations).orderBy(desc(itemLocations.id)).limit(1);
    const nextNum = all.length > 0 ? all[0].id + 1 : 1;
    const code = `LOC-${String(nextNum).padStart(2, '0')}`;

    const [created] = await db
      .insert(itemLocations)
      .values({
        code,
        name: payload.name.trim(),
        description: (payload.description || '').trim(),
        isActive: true,
        sortOrder: payload.sortOrder ?? nextNum,
      })
      .returning();

    await db.insert(auditLogs).values({
      actorUserId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.role,
      action: 'CREATE_LOCATION',
      entityType: 'item_locations',
      entityId: String(created.id),
      details: `Menambahkan lokasi workshop baru: ${created.name} (${created.code}).`,
    });

    return {
      id: created.id,
      code: created.code,
      name: created.name,
      description: created.description,
      isActive: created.isActive,
      sortOrder: created.sortOrder,
    };
  } catch (error) {
    wrapDbError(error, 'Gagal menambahkan lokasi workshop.');
  }
}

export async function updateLocation(
  actor: UserProfile,
  locationId: number,
  payload: { name?: string; description?: string; isActive?: boolean; sortOrder?: number }
): Promise<LocationRecord> {
  try {
    const existing = await db
      .select()
      .from(itemLocations)
      .where(eq(itemLocations.id, locationId))
      .limit(1);
    if (existing.length === 0) {
      throw new HttpError(404, 'Lokasi tidak ditemukan.');
    }

    const [updated] = await db
      .update(itemLocations)
      .set({
        name: payload.name !== undefined ? payload.name.trim() : existing[0].name,
        description:
          payload.description !== undefined ? payload.description.trim() : existing[0].description,
        isActive: payload.isActive !== undefined ? payload.isActive : existing[0].isActive,
        sortOrder: payload.sortOrder !== undefined ? payload.sortOrder : existing[0].sortOrder,
      })
      .where(eq(itemLocations.id, locationId))
      .returning();

    await db.insert(auditLogs).values({
      actorUserId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.role,
      action: 'UPDATE_LOCATION',
      entityType: 'item_locations',
      entityId: String(updated.id),
      details: `Memperbarui lokasi ${updated.name} (aktif=${updated.isActive}).`,
    });

    return {
      id: updated.id,
      code: updated.code,
      name: updated.name,
      description: updated.description,
      isActive: updated.isActive,
      sortOrder: updated.sortOrder,
    };
  } catch (error) {
    wrapDbError(error, 'Gagal memperbarui lokasi workshop.');
  }
}

async function hydrateItemsSummary(
  itemRows: (typeof workOrderItems.$inferSelect)[]
): Promise<WorkOrderItemSummary[]> {
  if (itemRows.length === 0) return [];

  const [woRows, custRows, locRows, userRows, activeAssignments] = await Promise.all([
    db.select().from(workOrders),
    db.select().from(customers),
    db.select().from(itemLocations),
    db.select().from(users),
    db
      .select()
      .from(technicianAssignments)
      .where(eq(technicianAssignments.assignmentStatus, 'ACTIVE')),
  ]);

  const woMap = new Map(woRows.map((w) => [w.id, w]));
  const custMap = new Map(custRows.map((c) => [c.id, c]));
  const locMap = new Map(locRows.map((l) => [l.id, l]));
  const userMap = new Map(userRows.map((u) => [u.id, u]));

  const now = Date.now();

  return itemRows.map((item) => {
    const wo = woMap.get(item.workOrderId);
    const cust = wo ? custMap.get(wo.customerId) : undefined;
    const loc = item.currentLocationId ? locMap.get(item.currentLocationId) : undefined;
    const leadTech = item.leadTechnicianId ? userMap.get(item.leadTechnicianId) : undefined;

    const itemAssigns = activeAssignments.filter((a) => a.itemId === item.id);
    const supportNames = itemAssigns
      .filter((a) => a.assignmentRole === 'SUPPORT')
      .map((a) => a.technicianName);
    const assignedIds = Array.from(
      new Set([
        ...(item.leadTechnicianId ? [item.leadTechnicianId] : []),
        ...itemAssigns.map((a) => a.technicianId),
      ])
    );

    const terminalStatuses: ItemStatus[] = ['READY_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'];
    const isOverdue =
      !terminalStatuses.includes(item.currentStatus as ItemStatus) &&
      item.estimatedCompletion.getTime() < now;

    return {
      id: item.id,
      workOrderId: item.workOrderId,
      woNumber: wo?.woNumber || '-',
      priority: (wo?.priority as PriorityLevel) || 'NORMAL',
      itemCode: item.itemCode,
      qrToken: item.qrToken,
      itemName: item.itemName,
      componentType: item.componentType,
      brandModel: item.brandModel,
      serialNumber: item.serialNumber,
      quantity: item.quantity,
      initialDamage: item.initialDamage,
      repairType: item.repairType,
      physicalCondition: item.physicalCondition,
      currentStatus: item.currentStatus as ItemStatus,
      currentLocationId: item.currentLocationId,
      currentLocationName: loc?.name || 'Belum Ditentukan',
      leadTechnicianId: item.leadTechnicianId,
      leadTechnicianName: leadTech?.fullName || 'Belum Ditugaskan',
      supportTechnicianNames: supportNames,
      assignedTechnicianIds: assignedIds,
      approvedStageProgress: item.approvedStageProgress,
      inspectionApproved: item.inspectionApproved,
      repairApproved: item.repairApproved,
      customerName: cust?.contactName || '-',
      companyName: cust?.companyName || '-',
      customerId: cust?.id || 0,
      receivedAt: (wo?.receivedAt || item.createdAt).toISOString(),
      estimatedCompletion: item.estimatedCompletion.toISOString(),
      completedAt: item.completedAt ? item.completedAt.toISOString() : null,
      deliveredAt: item.deliveredAt ? item.deliveredAt.toISOString() : null,
      isOverdue,
    };
  });
}

export async function createWorkOrderWithItems(
  actor: UserProfile,
  payload: {
    customerId?: number;
    newCustomer?: {
      contactName: string;
      companyName: string;
      phone?: string;
      email?: string;
    };
    receivedAt?: string;
    receiverName: string;
    priority: PriorityLevel;
    estimatedCompletion: string;
    notes?: string;
    items: Array<{
      itemName: string;
      componentType: string;
      brandModel?: string;
      serialNumber?: string;
      quantity?: number;
      initialDamage: string;
      repairType?: string;
      physicalCondition: string;
      locationId?: number;
      estimatedCompletion?: string;
      additionalNotes?: string;
      incomingPhotos?: Array<{
        fileName: string;
        mimeType: string;
        dataUrl: string;
        caption?: string;
      }>;
    }>;
  }
): Promise<WorkOrderRecord> {
  try {
    if (!payload.items || payload.items.length === 0) {
      throw new HttpError(400, 'Minimal satu barang harus didaftarkan pada Work Order.');
    }

    await ensureDefaultLocations();

    const createdWoId = await db.transaction(async (tx) => {
      let customerId = payload.customerId;
      let companyNameForNotif = '';

      if (!customerId && payload.newCustomer) {
        if (!payload.newCustomer.contactName.trim() || !payload.newCustomer.companyName.trim()) {
          throw new HttpError(400, 'Nama customer dan nama perusahaan wajib diisi.');
        }
        const lastCust = await tx
          .select()
          .from(customers)
          .orderBy(desc(customers.id))
          .limit(1);
        const nextCustNum = lastCust.length > 0 ? lastCust[0].id + 1 : 1;
        const [newCust] = await tx
          .insert(customers)
          .values({
            customerCode: `CUST-${String(nextCustNum).padStart(4, '0')}`,
            contactName: payload.newCustomer.contactName.trim(),
            companyName: payload.newCustomer.companyName.trim(),
            phone: (payload.newCustomer.phone || '').trim(),
            email: (payload.newCustomer.email || '').trim(),
            address: '',
          })
          .returning();
        customerId = newCust.id;
        companyNameForNotif = newCust.companyName;
      } else if (customerId) {
        const existingCust = await tx
          .select()
          .from(customers)
          .where(eq(customers.id, customerId))
          .limit(1);
        if (existingCust.length === 0) {
          throw new HttpError(404, 'Data customer tidak ditemukan.');
        }
        companyNameForNotif = existingCust[0].companyName;
      } else {
        throw new HttpError(400, 'Pilih customer atau tambahkan customer baru.');
      }

      const receivedDate = payload.receivedAt ? new Date(payload.receivedAt) : new Date();
      const woEstDate = new Date(payload.estimatedCompletion);
      const year = receivedDate.getFullYear();

      // Generate safe unique Work Order number inside transaction
      const allWos = await tx
        .select()
        .from(workOrders)
        .orderBy(desc(workOrders.id));

      let maxSeq = 0;
      const prefix = `WO-${year}-`;
      for (const w of allWos) {
        if (w.woNumber.startsWith(prefix)) {
          const parsed = parseInt(w.woNumber.slice(prefix.length), 10);
          if (!Number.isNaN(parsed) && parsed > maxSeq) {
            maxSeq = parsed;
          }
        }
      }
      const woNumber = `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;

      const [newWo] = await tx
        .insert(workOrders)
        .values({
          woNumber,
          customerId,
          receivedAt: receivedDate,
          receivedByUserId: actor.id,
          receiverName: payload.receiverName.trim() || actor.fullName,
          priority: payload.priority || 'NORMAL',
          estimatedCompletion: woEstDate,
          status: 'OPEN',
          notes: (payload.notes || '').trim(),
        })
        .returning();

      const allLocations = await tx
        .select()
        .from(itemLocations)
        .orderBy(asc(itemLocations.sortOrder));
      const defaultReceivingLoc =
        allLocations.find((l) => l.name.toLowerCase().includes('receiving')) || allLocations[0];

      for (let idx = 0; idx < payload.items.length; idx++) {
        const itemInput = payload.items[idx];
        if (!itemInput.itemName.trim() || !itemInput.initialDamage.trim()) {
          throw new HttpError(400, `Nama barang dan kerusakan awal pada item #${idx + 1} wajib diisi.`);
        }

        const itemCode = `${woNumber}-${String(idx + 1).padStart(2, '0')}`;
        const qrToken = `wtk_${crypto.randomBytes(12).toString('hex')}`;
        const chosenLoc =
          (itemInput.locationId
            ? allLocations.find((l) => l.id === itemInput.locationId)
            : undefined) || defaultReceivingLoc;

        const itemEst = itemInput.estimatedCompletion
          ? new Date(itemInput.estimatedCompletion)
          : woEstDate;

        const [createdItem] = await tx
          .insert(workOrderItems)
          .values({
            workOrderId: newWo.id,
            itemCode,
            qrToken,
            itemName: itemInput.itemName.trim(),
            componentType: itemInput.componentType.trim() || 'Engine Component',
            brandModel: (itemInput.brandModel || '').trim(),
            serialNumber: (itemInput.serialNumber || '').trim(),
            quantity: Math.max(1, Number(itemInput.quantity) || 1),
            initialDamage: itemInput.initialDamage.trim(),
            repairType: (itemInput.repairType || 'Inspeksi & Evaluasi Awal').trim(),
            physicalCondition: itemInput.physicalCondition.trim() || ' Komponen diterima utuh untuk inspeksi',
            currentStatus: 'RECEIVED',
            currentLocationId: chosenLoc ? chosenLoc.id : null,
            approvedStageProgress: 10,
            estimatedCompletion: itemEst,
            additionalNotes: (itemInput.additionalNotes || '').trim(),
          })
          .returning();

        // Initial status history
        await tx.insert(statusHistory).values({
          itemId: createdItem.id,
          previousStatus: null,
          newStatus: 'RECEIVED',
          changedByUserId: actor.id,
          changedByName: actor.fullName,
          notes: `Barang diterima oleh ${newWo.receiverName}. Kondisi awal: ${createdItem.physicalCondition}`,
        });

        // Initial location movement history
        if (chosenLoc) {
          await tx.insert(movementHistory).values({
            itemId: createdItem.id,
            fromLocationId: null,
            toLocationId: chosenLoc.id,
            fromLocationName: null,
            toLocationName: chosenLoc.name,
            movedByUserId: actor.id,
            movedByName: actor.fullName,
            reason: 'Penerimaan awal barang masuk ke workshop',
          });
        }

        // Incoming photos
        if (itemInput.incomingPhotos && itemInput.incomingPhotos.length > 0) {
          for (const photo of itemInput.incomingPhotos) {
            await tx.insert(attachments).values({
              itemId: createdItem.id,
              activityId: null,
              category: 'INCOMING',
              fileName: photo.fileName || 'incoming.jpg',
              mimeType: photo.mimeType || 'image/jpeg',
              dataUrl: photo.dataUrl,
              caption: (photo.caption || 'Kondisi fisik saat diterima').trim(),
              uploadedByUserId: actor.id,
              uploadedByName: actor.fullName,
            });
          }
        }

        // Notification for new item received
        await tx.insert(notifications).values({
          targetRole: 'ALL',
          targetUserId: null,
          type: 'ITEM_RECEIVED',
          title: `Barang Baru Diterima: ${createdItem.itemName}`,
          message: `${woNumber} (${createdItem.itemCode}) dari ${companyNameForNotif} telah diterima di ${chosenLoc?.name || 'Workshop'}.`,
          itemId: createdItem.id,
        });
      }

      await tx.insert(auditLogs).values({
        actorUserId: actor.id,
        actorName: actor.fullName,
        actorRole: actor.role,
        action: 'CREATE_WORK_ORDER',
        entityType: 'work_orders',
        entityId: woNumber,
        details: `Mendaftarkan Work Order ${woNumber} (${payload.items.length} item) untuk ${companyNameForNotif}.`,
      });

      return newWo.id;
    });

    const allOrders = await listWorkOrders();
    const found = allOrders.find((o) => o.id === createdWoId);
    if (!found) {
      throw new Error('Work Order berhasil disimpan namun gagal dimuat kembali.');
    }
    return found;
  } catch (error) {
    wrapDbError(error, 'Gagal menyimpan penerimaan barang masuk.');
  }
}

export async function listWorkOrders(): Promise<WorkOrderRecord[]> {
  try {
    const [woRows, custRows, itemRows] = await Promise.all([
      db.select().from(workOrders).orderBy(desc(workOrders.receivedAt), desc(workOrders.id)),
      db.select().from(customers),
      db.select().from(workOrderItems).orderBy(asc(workOrderItems.id)),
    ]);

    const summaries = await hydrateItemsSummary(itemRows);
    const custMap = new Map(custRows.map((c) => [c.id, c]));

    return woRows.map((wo) => {
      const cust = custMap.get(wo.customerId);
      const woItems = summaries.filter((i) => i.workOrderId === wo.id);
      return {
        id: wo.id,
        woNumber: wo.woNumber,
        customerId: wo.customerId,
        customerName: cust?.contactName || '-',
        companyName: cust?.companyName || '-',
        receivedAt: wo.receivedAt.toISOString(),
        receivedByUserId: wo.receivedByUserId,
        receiverName: wo.receiverName,
        priority: wo.priority as PriorityLevel,
        estimatedCompletion: wo.estimatedCompletion.toISOString(),
        status: wo.status,
        notes: wo.notes,
        itemCount: woItems.length,
        items: woItems,
      };
    });
  } catch (error) {
    wrapDbError(error, 'Gagal memuat daftar Work Order.');
  }
}

export async function updateWorkOrderPriority(
  actor: UserProfile,
  woId: number,
  priority: PriorityLevel,
  estimatedCompletion?: string
): Promise<void> {
  try {
    const existing = await db.select().from(workOrders).where(eq(workOrders.id, woId)).limit(1);
    if (existing.length === 0) {
      throw new HttpError(404, 'Work Order tidak ditemukan.');
    }

    await db
      .update(workOrders)
      .set({
        priority,
        estimatedCompletion: estimatedCompletion
          ? new Date(estimatedCompletion)
          : existing[0].estimatedCompletion,
        updatedAt: new Date(),
      })
      .where(eq(workOrders.id, woId));

    await db.insert(auditLogs).values({
      actorUserId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.role,
      action: 'UPDATE_WO_PRIORITY',
      entityType: 'work_orders',
      entityId: existing[0].woNumber,
      details: `Mengubah prioritas ${existing[0].woNumber} menjadi ${priority}.`,
    });
  } catch (error) {
    wrapDbError(error, 'Gagal memperbarui prioritas Work Order.');
  }
}

export async function listItems(): Promise<WorkOrderItemSummary[]> {
  try {
    const rows = await db
      .select()
      .from(workOrderItems)
      .orderBy(desc(workOrderItems.updatedAt), desc(workOrderItems.id));
    return await hydrateItemsSummary(rows);
  } catch (error) {
    wrapDbError(error, 'Gagal memuat daftar barang workshop.');
  }
}

export async function getItemDetail(identifier: string): Promise<WorkOrderItemDetail> {
  try {
    const clean = identifier.trim();
    const numericId = /^\d+$/.test(clean) ? Number(clean) : -1;

    const itemRows = await db
      .select()
      .from(workOrderItems)
      .where(
        numericId > 0
          ? or(
              eq(workOrderItems.id, numericId),
              eq(workOrderItems.qrToken, clean),
              eq(workOrderItems.itemCode, clean)
            )
          : or(
              eq(workOrderItems.qrToken, clean),
              eq(workOrderItems.itemCode, clean)
            )
      )
      .limit(1);

    if (itemRows.length === 0) {
      throw new HttpError(404, 'Barang dengan kode atau QR Token tersebut tidak ditemukan.');
    }

    const item = itemRows[0];
    const [summary] = await hydrateItemsSummary([item]);

    const [woRow, statuses, movements, assigns, acts, attachRows] = await Promise.all([
      db.select().from(workOrders).where(eq(workOrders.id, item.workOrderId)).limit(1),
      db
        .select()
        .from(statusHistory)
        .where(eq(statusHistory.itemId, item.id))
        .orderBy(desc(statusHistory.createdAt), desc(statusHistory.id)),
      db
        .select()
        .from(movementHistory)
        .where(eq(movementHistory.itemId, item.id))
        .orderBy(desc(movementHistory.createdAt), desc(movementHistory.id)),
      db
        .select()
        .from(technicianAssignments)
        .where(eq(technicianAssignments.itemId, item.id))
        .orderBy(desc(technicianAssignments.startedAt), desc(technicianAssignments.id)),
      db
        .select()
        .from(repairActivities)
        .where(eq(repairActivities.itemId, item.id))
        .orderBy(desc(repairActivities.createdAt), desc(repairActivities.id)),
      db
        .select()
        .from(attachments)
        .where(eq(attachments.itemId, item.id))
        .orderBy(desc(attachments.createdAt), desc(attachments.id)),
    ]);

    const mappedAttachments = attachRows.map((a) => ({
      id: a.id,
      itemId: a.itemId,
      activityId: a.activityId,
      category: a.category as AttachmentCategory,
      fileName: a.fileName,
      mimeType: a.mimeType,
      dataUrl: a.dataUrl,
      caption: a.caption,
      uploadedByUserId: a.uploadedByUserId,
      uploadedByName: a.uploadedByName,
      createdAt: a.createdAt.toISOString(),
    }));

    return {
      ...summary,
      additionalNotes: item.additionalNotes,
      receiverName: woRow[0]?.receiverName || '-',
      woNotes: woRow[0]?.notes || '',
      statusHistory: statuses.map((s) => ({
        id: s.id,
        itemId: s.itemId,
        previousStatus: s.previousStatus,
        newStatus: s.newStatus,
        changedByUserId: s.changedByUserId,
        changedByName: s.changedByName,
        notes: s.notes,
        createdAt: s.createdAt.toISOString(),
      })),
      movementHistory: movements.map((m) => ({
        id: m.id,
        itemId: m.itemId,
        fromLocationId: m.fromLocationId,
        toLocationId: m.toLocationId,
        fromLocationName: m.fromLocationName,
        toLocationName: m.toLocationName,
        movedByUserId: m.movedByUserId,
        movedByName: m.movedByName,
        reason: m.reason,
        createdAt: m.createdAt.toISOString(),
      })),
      assignments: assigns.map((asg) => ({
        id: asg.id,
        itemId: asg.itemId,
        technicianId: asg.technicianId,
        technicianName: asg.technicianName,
        assignedById: asg.assignedById,
        assignedByName: asg.assignedByName,
        assignmentRole: asg.assignmentRole as 'LEAD' | 'SUPPORT',
        jobType: asg.jobType,
        assignmentStatus: asg.assignmentStatus as 'ACTIVE' | 'COMPLETED' | 'REASSIGNED',
        activityNotes: asg.activityNotes,
        startedAt: asg.startedAt.toISOString(),
        completedAt: asg.completedAt ? asg.completedAt.toISOString() : null,
      })),
      activities: acts.map((act) => ({
        id: act.id,
        itemId: act.itemId,
        technicianId: act.technicianId,
        technicianName: act.technicianName,
        jobType: act.jobType,
        description: act.description,
        inspectionResult: act.inspectionResult,
        issues: act.issues,
        isApproved: act.isApproved,
        approvedById: act.approvedById,
        approvedByName: act.approvedByName,
        approvedAt: act.approvedAt ? act.approvedAt.toISOString() : null,
        createdAt: act.createdAt.toISOString(),
        attachments: mappedAttachments.filter((at) => at.activityId === act.id),
      })),
      attachments: mappedAttachments,
    };
  } catch (error) {
    wrapDbError(error, 'Gagal memuat detail barang.');
  }
}

async function assertCanModifyTechnicalItem(actor: UserProfile, itemId: number): Promise<typeof workOrderItems.$inferSelect> {
  if (actor.role === 'MANAJEMEN') {
    throw new HttpError(
      403,
      'Akses ditolak: Akun Manajemen tidak memiliki izin mengubah data teknis pekerjaan.'
    );
  }

  const rows = await db
    .select()
    .from(workOrderItems)
    .where(eq(workOrderItems.id, itemId))
    .limit(1);

  if (rows.length === 0) {
    throw new HttpError(404, 'Data barang tidak ditemukan.');
  }

  const item = rows[0];

  if (actor.role === 'TEKNISI') {
    const activeAssigns = await db
      .select()
      .from(technicianAssignments)
      .where(
        and(
          eq(technicianAssignments.itemId, itemId),
          eq(technicianAssignments.technicianId, actor.id),
          eq(technicianAssignments.assignmentStatus, 'ACTIVE')
        )
      );

    const isAssigned = item.leadTechnicianId === actor.id || activeAssigns.length > 0;
    if (!isAssigned) {
      throw new HttpError(
        403,
        'Akses ditolak: Teknisi hanya dapat memperbarui pekerjaan pada barang yang ditugaskan kepadanya.'
      );
    }
  }

  return item;
}

export async function updateItemMetadata(
  actor: UserProfile,
  itemId: number,
  payload: {
    itemName: string;
    componentType: string;
    brandModel: string;
    serialNumber: string;
    quantity: number;
    initialDamage: string;
    repairType: string;
    physicalCondition: string;
    estimatedCompletion: string;
    additionalNotes: string;
  }
): Promise<WorkOrderItemDetail> {
  try {
    const existing = await db
      .select()
      .from(workOrderItems)
      .where(eq(workOrderItems.id, itemId))
      .limit(1);
    if (existing.length === 0) {
      throw new HttpError(404, 'Barang tidak ditemukan.');
    }

    await db
      .update(workOrderItems)
      .set({
        itemName: payload.itemName.trim(),
        componentType: payload.componentType.trim(),
        brandModel: payload.brandModel.trim(),
        serialNumber: payload.serialNumber.trim(),
        quantity: Math.max(1, Number(payload.quantity) || 1),
        initialDamage: payload.initialDamage.trim(),
        repairType: payload.repairType.trim(),
        physicalCondition: payload.physicalCondition.trim(),
        estimatedCompletion: new Date(payload.estimatedCompletion),
        additionalNotes: payload.additionalNotes.trim(),
        updatedAt: new Date(),
      })
      .where(eq(workOrderItems.id, itemId));

    await db.insert(auditLogs).values({
      actorUserId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.role,
      action: 'EDIT_ITEM_INFO',
      entityType: 'work_order_items',
      entityId: existing[0].itemCode,
      details: `Memperbarui informasi teknis barang ${existing[0].itemCode} (${payload.itemName}).`,
    });

    return await getItemDetail(String(itemId));
  } catch (error) {
    wrapDbError(error, 'Gagal memperbarui informasi barang.');
  }
}

export async function updateItemStatus(
  actor: UserProfile,
  itemId: number,
  payload: { newStatus: ItemStatus; notes: string }
): Promise<WorkOrderItemDetail> {
  try {
    if (!payload.notes.trim()) {
      throw new HttpError(400, 'Catatan pekerjaan wajib diisi setiap perubahan status.');
    }

    const item = await assertCanModifyTechnicalItem(actor, itemId);

    const newProgress = computeStageProgress(
      payload.newStatus,
      item.inspectionApproved,
      item.repairApproved,
      item.approvedStageProgress
    );

    const now = new Date();
    const completedAt =
      payload.newStatus === 'READY_FOR_DELIVERY'
        ? now
        : item.completedAt;
    const deliveredAt =
      payload.newStatus === 'DELIVERED' ? now : item.deliveredAt;

    await db.transaction(async (tx) => {
      await tx
        .update(workOrderItems)
        .set({
          currentStatus: payload.newStatus,
          approvedStageProgress: newProgress,
          completedAt,
          deliveredAt,
          updatedAt: now,
        })
        .where(eq(workOrderItems.id, itemId));

      await tx.insert(statusHistory).values({
        itemId,
        previousStatus: item.currentStatus,
        newStatus: payload.newStatus,
        changedByUserId: actor.id,
        changedByName: actor.fullName,
        notes: payload.notes.trim(),
      });

      // Sync parent Work Order status
      const siblingItems = await tx
        .select()
        .from(workOrderItems)
        .where(eq(workOrderItems.workOrderId, item.workOrderId));

      const allDelivered = siblingItems.every((s) => s.currentStatus === 'DELIVERED');
      const allCompleted = siblingItems.every((s) =>
        ['READY_FOR_DELIVERY', 'DELIVERED'].includes(s.currentStatus)
      );
      const parentStatus = allDelivered
        ? 'DELIVERED'
        : allCompleted
        ? 'COMPLETED'
        : 'IN_PROGRESS';

      await tx
        .update(workOrders)
        .set({ status: parentStatus, updatedAt: now })
        .where(eq(workOrders.id, item.workOrderId));

      // Create targeted notifications
      const statusLabel = STATUS_LABELS[payload.newStatus] || payload.newStatus;
      let notifType = 'STATUS_CHANGED';
      let notifTitle = `Status Diperbarui: ${item.itemName}`;
      if (payload.newStatus === 'QUALITY_CONTROL') {
        notifType = 'QC_STAGE';
        notifTitle = `Tahap Quality Control: ${item.itemName}`;
      } else if (payload.newStatus === 'READY_FOR_DELIVERY') {
        notifType = 'ITEM_COMPLETED';
        notifTitle = `Selesai Diperbaiki: ${item.itemName}`;
      } else if (
        payload.newStatus === 'WAITING_FOR_SPARE_PART' ||
        payload.newStatus === 'ON_HOLD'
      ) {
        notifType = 'JOB_DELAYED';
        notifTitle = `Pekerjaan Tertunda: ${item.itemName}`;
      }

      await tx.insert(notifications).values({
        targetRole: 'ALL',
        targetUserId: null,
        type: notifType,
        title: notifTitle,
        message: `${item.itemCode} berubah menjadi "${statusLabel}" oleh ${actor.fullName}. Catatan: ${payload.notes.trim()}`,
        itemId,
      });

      await tx.insert(auditLogs).values({
        actorUserId: actor.id,
        actorName: actor.fullName,
        actorRole: actor.role,
        action: 'UPDATE_STATUS',
        entityType: 'work_order_items',
        entityId: item.itemCode,
        details: `Status ${item.itemCode}: ${item.currentStatus} -> ${payload.newStatus}. Catatan: ${payload.notes.trim()}`,
      });
    });

    return await getItemDetail(String(itemId));
  } catch (error) {
    wrapDbError(error, 'Gagal memperbarui status pengerjaan barang.');
  }
}

export async function moveItemLocation(
  actor: UserProfile,
  itemId: number,
  payload: { toLocationId: number; reason: string }
): Promise<WorkOrderItemDetail> {
  try {
    if (!payload.reason.trim()) {
      throw new HttpError(400, 'Alasan perpindahan lokasi wajib diisi.');
    }

    const item = await assertCanModifyTechnicalItem(actor, itemId);

    const targetLocRows = await db
      .select()
      .from(itemLocations)
      .where(eq(itemLocations.id, payload.toLocationId))
      .limit(1);

    if (targetLocRows.length === 0 || !targetLocRows[0].isActive) {
      throw new HttpError(400, 'Lokasi tujuan tidak valid atau sedang dinonaktifkan.');
    }

    const targetLoc = targetLocRows[0];
    let fromLocName: string | null = null;
    if (item.currentLocationId) {
      const fromRows = await db
        .select()
        .from(itemLocations)
        .where(eq(itemLocations.id, item.currentLocationId))
        .limit(1);
      fromLocName = fromRows[0]?.name || null;
    }

    await db.transaction(async (tx) => {
      await tx
        .update(workOrderItems)
        .set({
          currentLocationId: targetLoc.id,
          updatedAt: new Date(),
        })
        .where(eq(workOrderItems.id, itemId));

      await tx.insert(movementHistory).values({
        itemId,
        fromLocationId: item.currentLocationId,
        toLocationId: targetLoc.id,
        fromLocationName: fromLocName,
        toLocationName: targetLoc.name,
        movedByUserId: actor.id,
        movedByName: actor.fullName,
        reason: payload.reason.trim(),
      });

      await tx.insert(notifications).values({
        targetRole: 'ALL',
        targetUserId: null,
        type: 'LOCATION_MOVED',
        title: `Perpindahan Lokasi: ${item.itemName}`,
        message: `${item.itemCode} dipindahkan dari ${fromLocName || 'Awal'} ke ${targetLoc.name} oleh ${actor.fullName}.`,
        itemId,
      });

      await tx.insert(auditLogs).values({
        actorUserId: actor.id,
        actorName: actor.fullName,
        actorRole: actor.role,
        action: 'MOVE_LOCATION',
        entityType: 'work_order_items',
        entityId: item.itemCode,
        details: `Lokasi ${item.itemCode}: ${fromLocName || '-'} -> ${targetLoc.name}. Alasan: ${payload.reason.trim()}`,
      });
    });

    return await getItemDetail(String(itemId));
  } catch (error) {
    wrapDbError(error, 'Gagal mencatat perpindahan lokasi barang.');
  }
}

export async function performQuickScanUpdate(
  actor: UserProfile,
  itemId: number,
  payload: {
    newStatus?: ItemStatus;
    toLocationId?: number;
    notes: string;
    jobType?: string;
    logActivity?: boolean;
    photos?: Array<{
      category: AttachmentCategory;
      fileName: string;
      mimeType: string;
      dataUrl: string;
    }>;
  }
): Promise<WorkOrderItemDetail> {
  try {
    const cleanNotes = (payload.notes || '').trim();
    if (!cleanNotes) {
      throw new HttpError(
        400,
        'Catatan progres atau alasan perpindahan barang wajib diisi.'
      );
    }

    const item = await assertCanModifyTechnicalItem(actor, itemId);

    const statusChanged =
      Boolean(payload.newStatus) && payload.newStatus !== item.currentStatus;
    const locationChanged =
      Boolean(payload.toLocationId) &&
      Number(payload.toLocationId) > 0 &&
      Number(payload.toLocationId) !== item.currentLocationId;
    const hasActivity =
      Boolean(payload.logActivity) ||
      Boolean(payload.photos && payload.photos.length > 0);

    if (!statusChanged && !locationChanged && !hasActivity) {
      throw new HttpError(
        400,
        'Pilih perubahan status, lokasi area tujuan baru, atau centang pencatatan progres harian.'
      );
    }

    let targetLoc: typeof itemLocations.$inferSelect | null = null;
    let fromLocName: string | null = null;

    if (locationChanged && payload.toLocationId) {
      const targetLocRows = await db
        .select()
        .from(itemLocations)
        .where(eq(itemLocations.id, Number(payload.toLocationId)))
        .limit(1);

      if (targetLocRows.length === 0 || !targetLocRows[0].isActive) {
        throw new HttpError(
          400,
          'Lokasi tujuan tidak valid atau sedang dinonaktifkan.'
        );
      }
      targetLoc = targetLocRows[0];

      if (item.currentLocationId) {
        const fromRows = await db
          .select()
          .from(itemLocations)
          .where(eq(itemLocations.id, item.currentLocationId))
          .limit(1);
        fromLocName = fromRows[0]?.name || null;
      }
    }

    const now = new Date();
    const effectiveStatus = statusChanged
      ? payload.newStatus!
      : (item.currentStatus as ItemStatus);
    const newProgress = statusChanged
      ? computeStageProgress(
          effectiveStatus,
          item.inspectionApproved,
          item.repairApproved,
          item.approvedStageProgress
        )
      : item.approvedStageProgress;

    const completedAt =
      statusChanged && effectiveStatus === 'READY_FOR_DELIVERY'
        ? now
        : item.completedAt;
    const deliveredAt =
      statusChanged && effectiveStatus === 'DELIVERED' ? now : item.deliveredAt;

    await db.transaction(async (tx) => {
      await tx
        .update(workOrderItems)
        .set({
          currentStatus: effectiveStatus,
          currentLocationId: targetLoc ? targetLoc.id : item.currentLocationId,
          approvedStageProgress: newProgress,
          completedAt,
          deliveredAt,
          updatedAt: now,
        })
        .where(eq(workOrderItems.id, itemId));

      if (statusChanged) {
        await tx.insert(statusHistory).values({
          itemId,
          previousStatus: item.currentStatus,
          newStatus: effectiveStatus,
          changedByUserId: actor.id,
          changedByName: actor.fullName,
          notes: cleanNotes,
        });

        const siblingItems = await tx
          .select()
          .from(workOrderItems)
          .where(eq(workOrderItems.workOrderId, item.workOrderId));

        const allDelivered = siblingItems.every(
          (s) => s.currentStatus === 'DELIVERED'
        );
        const allCompleted = siblingItems.every((s) =>
          ['READY_FOR_DELIVERY', 'DELIVERED'].includes(s.currentStatus)
        );
        const parentStatus = allDelivered
          ? 'DELIVERED'
          : allCompleted
          ? 'COMPLETED'
          : 'IN_PROGRESS';

        await tx
          .update(workOrders)
          .set({ status: parentStatus, updatedAt: now })
          .where(eq(workOrders.id, item.workOrderId));
      }

      if (locationChanged && targetLoc) {
        await tx.insert(movementHistory).values({
          itemId,
          fromLocationId: item.currentLocationId,
          toLocationId: targetLoc.id,
          fromLocationName: fromLocName,
          toLocationName: targetLoc.name,
          movedByUserId: actor.id,
          movedByName: actor.fullName,
          reason: cleanNotes,
        });
      }

      if (hasActivity) {
        const [newAct] = await tx
          .insert(repairActivities)
          .values({
            itemId,
            technicianId: actor.id,
            technicianName: actor.fullName,
            jobType: (payload.jobType || item.repairType || 'Pemesinan & Inspeksi').trim(),
            description: cleanNotes,
            inspectionResult: '',
            issues: '',
            isApproved: actor.role === 'ADMIN' || actor.role === 'SUPERVISOR',
            approvedById:
              actor.role === 'ADMIN' || actor.role === 'SUPERVISOR'
                ? actor.id
                : null,
            approvedByName:
              actor.role === 'ADMIN' || actor.role === 'SUPERVISOR'
                ? actor.fullName
                : null,
            approvedAt:
              actor.role === 'ADMIN' || actor.role === 'SUPERVISOR' ? now : null,
          })
          .returning();

        if (payload.photos && payload.photos.length > 0) {
          for (const ph of payload.photos) {
            await tx.insert(attachments).values({
              itemId,
              activityId: newAct.id,
              category: ph.category || 'DURING',
              fileName: ph.fileName || 'quick-scan.jpg',
              mimeType: ph.mimeType || 'image/jpeg',
              dataUrl: ph.dataUrl,
              caption: cleanNotes,
              uploadedByUserId: actor.id,
              uploadedByName: actor.fullName,
            });
          }
        }
      }

      const summaryParts: string[] = [];
      if (statusChanged) {
        summaryParts.push(
          `Status → ${STATUS_LABELS[effectiveStatus] || effectiveStatus}`
        );
      }
      if (locationChanged && targetLoc) {
        summaryParts.push(`Lokasi → ${targetLoc.name}`);
      }
      if (hasActivity) {
        summaryParts.push('Progres Harian tercatat');
      }

      await tx.insert(notifications).values({
        targetRole: 'ALL',
        targetUserId: null,
        type: 'QUICK_SCAN_UPDATE',
        title: `Update Scan QR: ${item.itemName}`,
        message: `${item.itemCode} diperbarui (${summaryParts.join(', ')}) oleh ${actor.fullName}. Catatan: ${cleanNotes}`,
        itemId,
      });

      await tx.insert(auditLogs).values({
        actorUserId: actor.id,
        actorName: actor.fullName,
        actorRole: actor.role,
        action: 'QUICK_SCAN_UPDATE',
        entityType: 'work_order_items',
        entityId: item.itemCode,
        details: `${summaryParts.join(' | ')} — Catatan: ${cleanNotes}`,
      });
    });

    return await getItemDetail(String(itemId));
  } catch (error) {
    wrapDbError(error, 'Gagal menyimpan pembaruan cepat hasil scan QR.');
  }
}

export async function assignTechniciansToItem(
  actor: UserProfile,
  itemId: number,
  payload: {
    leadTechnicianId: number;
    supportTechnicianIds?: number[];
    jobType: string;
    repairType?: string;
    activityNotes?: string;
  }
): Promise<WorkOrderItemDetail> {
  try {
    const itemRows = await db
      .select()
      .from(workOrderItems)
      .where(eq(workOrderItems.id, itemId))
      .limit(1);
    if (itemRows.length === 0) {
      throw new HttpError(404, 'Barang tidak ditemukan.');
    }
    const item = itemRows[0];

    const allTechIds = Array.from(
      new Set([payload.leadTechnicianId, ...(payload.supportTechnicianIds || [])])
    );
    const techUsers = await db
      .select()
      .from(users)
      .where(inArray(users.id, allTechIds));

    const leadUser = techUsers.find((u) => u.id === payload.leadTechnicianId);
    if (!leadUser) {
      throw new HttpError(404, 'Teknisi utama tidak ditemukan.');
    }

    const now = new Date();

    await db.transaction(async (tx) => {
      // Preserve assignment history: mark existing active assignments as REASSIGNED
      await tx
        .update(technicianAssignments)
        .set({
          assignmentStatus: 'REASSIGNED',
          completedAt: now,
        })
        .where(
          and(
            eq(technicianAssignments.itemId, itemId),
            eq(technicianAssignments.assignmentStatus, 'ACTIVE')
          )
        );

      // Insert new LEAD assignment
      await tx.insert(technicianAssignments).values({
        itemId,
        technicianId: leadUser.id,
        technicianName: leadUser.fullName,
        assignedById: actor.id,
        assignedByName: actor.fullName,
        assignmentRole: 'LEAD',
        jobType: payload.jobType.trim() || 'Inspeksi & Perbaikan',
        assignmentStatus: 'ACTIVE',
        activityNotes: (payload.activityNotes || '').trim(),
        startedAt: now,
      });

      // Insert SUPPORT assignments
      const supportIds = (payload.supportTechnicianIds || []).filter(
        (sid) => sid !== leadUser.id
      );
      for (const sid of supportIds) {
        const supUser = techUsers.find((u) => u.id === sid);
        if (supUser) {
          await tx.insert(technicianAssignments).values({
            itemId,
            technicianId: supUser.id,
            technicianName: supUser.fullName,
            assignedById: actor.id,
            assignedByName: actor.fullName,
            assignmentRole: 'SUPPORT',
            jobType: payload.jobType.trim() || 'Pendukung Teknis',
            assignmentStatus: 'ACTIVE',
            activityNotes: (payload.activityNotes || '').trim(),
            startedAt: now,
          });
        }
      }

      await tx
        .update(workOrderItems)
        .set({
          leadTechnicianId: leadUser.id,
          repairType: payload.repairType?.trim() || payload.jobType.trim() || item.repairType,
          updatedAt: now,
        })
        .where(eq(workOrderItems.id, itemId));

      // Notify assigned technicians
      for (const tech of techUsers) {
        await tx.insert(notifications).values({
          targetRole: 'TEKNISI',
          targetUserId: tech.id,
          type: 'ASSIGNMENT_NEW',
          title: `Penugasan Baru: ${item.itemName}`,
          message: `Anda ditugaskan oleh ${actor.fullName} untuk mengerjakan ${payload.jobType} pada ${item.itemCode}.`,
          itemId,
        });
      }

      await tx.insert(auditLogs).values({
        actorUserId: actor.id,
        actorName: actor.fullName,
        actorRole: actor.role,
        action: 'ASSIGN_TECHNICIAN',
        entityType: 'work_order_items',
        entityId: item.itemCode,
        details: `Menugaskan teknisi utama ${leadUser.fullName} (${payload.jobType}) pada ${item.itemCode}.`,
      });
    });

    return await getItemDetail(String(itemId));
  } catch (error) {
    wrapDbError(error, 'Gagal menyimpan penugasan teknisi.');
  }
}

export async function createDailyWorkActivity(
  actor: UserProfile,
  itemId: number,
  payload: {
    jobType: string;
    description: string;
    inspectionResult?: string;
    issues?: string;
    photos?: Array<{
      category: AttachmentCategory;
      fileName: string;
      mimeType: string;
      dataUrl: string;
      caption?: string;
    }>;
  }
): Promise<WorkOrderItemDetail> {
  try {
    if (!payload.jobType.trim() || !payload.description.trim()) {
      throw new HttpError(400, 'Jenis pekerjaan dan deskripsi aktivitas wajib diisi.');
    }

    const item = await assertCanModifyTechnicalItem(actor, itemId);

    await db.transaction(async (tx) => {
      const [activity] = await tx
        .insert(repairActivities)
        .values({
          itemId,
          technicianId: actor.id,
          technicianName: actor.fullName,
          jobType: payload.jobType.trim(),
          description: payload.description.trim(),
          inspectionResult: (payload.inspectionResult || '').trim(),
          issues: (payload.issues || '').trim(),
          isApproved: false,
        })
        .returning();

      if (payload.photos && payload.photos.length > 0) {
        for (const p of payload.photos) {
          await tx.insert(attachments).values({
            itemId,
            activityId: activity.id,
            category: p.category || 'DURING',
            fileName: p.fileName || 'progress.jpg',
            mimeType: p.mimeType || 'image/jpeg',
            dataUrl: p.dataUrl,
            caption: (p.caption || `${p.category} - ${payload.jobType}`).trim(),
            uploadedByUserId: actor.id,
            uploadedByName: actor.fullName,
          });
        }
      }

      await tx
        .update(workOrderItems)
        .set({ updatedAt: new Date() })
        .where(eq(workOrderItems.id, itemId));

      if (payload.issues && payload.issues.trim().length > 0) {
        await tx.insert(notifications).values({
          targetRole: 'SUPERVISOR',
          targetUserId: null,
          type: 'JOB_DELAYED',
          title: `Kendala Pekerjaan: ${item.itemName}`,
          message: `${actor.fullName} melaporkan kendala pada ${item.itemCode}: ${payload.issues.trim()}`,
          itemId,
        });
      }

      await tx.insert(auditLogs).values({
        actorUserId: actor.id,
        actorName: actor.fullName,
        actorRole: actor.role,
        action: 'LOG_REPAIR_ACTIVITY',
        entityType: 'repair_activities',
        entityId: String(activity.id),
        details: `Mencatat laporan aktivitas "${payload.jobType}" pada ${item.itemCode}.`,
      });
    });

    return await getItemDetail(String(itemId));
  } catch (error) {
    wrapDbError(error, 'Gagal menyimpan laporan progres pekerjaan.');
  }
}

export async function approveItemStage(
  actor: UserProfile,
  itemId: number,
  payload: {
    approvalType: 'INSPECTION' | 'REPAIR' | 'ACTIVITY';
    activityId?: number;
    notes?: string;
  }
): Promise<WorkOrderItemDetail> {
  try {
    const itemRows = await db
      .select()
      .from(workOrderItems)
      .where(eq(workOrderItems.id, itemId))
      .limit(1);
    if (itemRows.length === 0) {
      throw new HttpError(404, 'Barang tidak ditemukan.');
    }
    const item = itemRows[0];
    const now = new Date();

    await db.transaction(async (tx) => {
      if (payload.approvalType === 'ACTIVITY' && payload.activityId) {
        await tx
          .update(repairActivities)
          .set({
            isApproved: true,
            approvedById: actor.id,
            approvedByName: actor.fullName,
            approvedAt: now,
          })
          .where(eq(repairActivities.id, payload.activityId));
      } else {
        const nextInspection =
          payload.approvalType === 'INSPECTION' ? true : item.inspectionApproved;
        const nextRepair =
          payload.approvalType === 'REPAIR' ? true : item.repairApproved;

        const nextProgress = computeStageProgress(
          item.currentStatus,
          nextInspection,
          nextRepair,
          item.approvedStageProgress
        );

        await tx
          .update(workOrderItems)
          .set({
            inspectionApproved: nextInspection,
            repairApproved: nextRepair,
            approvedStageProgress: nextProgress,
            updatedAt: now,
          })
          .where(eq(workOrderItems.id, itemId));
      }

      await tx.insert(auditLogs).values({
        actorUserId: actor.id,
        actorName: actor.fullName,
        actorRole: actor.role,
        action: 'SUPERVISOR_APPROVAL',
        entityType: 'work_order_items',
        entityId: item.itemCode,
        details: `Menyetujui tahap ${payload.approvalType} pada ${item.itemCode}. ${payload.notes || ''}`.trim(),
      });
    });

    return await getItemDetail(String(itemId));
  } catch (error) {
    wrapDbError(error, 'Gagal memproses persetujuan supervisor.');
  }
}

export async function recordQrReprintAudit(
  actor: UserProfile,
  itemCode: string
): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      actorUserId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.role,
      action: 'REPRINT_QR_LABEL',
      entityType: 'work_order_items',
      entityId: itemCode,
      details: `Mencetak/mengunduh ulang label QR Code untuk ${itemCode}.`,
    });
  } catch (error) {
    wrapDbError(error, 'Gagal mencatat log cetak ulang QR.');
  }
}

export async function getDashboardData(filters: {
  startDate?: string;
  endDate?: string;
  customerId?: number;
  technicianId?: number;
  status?: string;
  locationId?: number;
  componentType?: string;
}): Promise<DashboardPayload> {
  try {
    const allItems = await listItems();
    const allUsers = await listUsers();

    // Generate automatic overdue notifications once per overdue item if missing
    const overdueRaw = allItems.filter((i) => i.isOverdue);
    if (overdueRaw.length > 0) {
      const existingOverdueNotifs = await db
        .select()
        .from(notifications)
        .where(eq(notifications.type, 'OVERDUE_ALERT'));
      const notifiedIds = new Set(existingOverdueNotifs.map((n) => n.itemId));

      for (const ov of overdueRaw) {
        if (!notifiedIds.has(ov.id)) {
          await db.insert(notifications).values({
            targetRole: 'ALL',
            targetUserId: null,
            type: 'OVERDUE_ALERT',
            title: `Melewati Estimasi Selesai: ${ov.itemName}`,
            message: `${ov.itemCode} (${ov.companyName}) telah melewati estimasi penyelesaian (${new Date(ov.estimatedCompletion).toLocaleDateString('id-ID')}).`,
            itemId: ov.id,
          });
        }
      }
    }

    // Apply client/query filters
    const filtered = allItems.filter((item) => {
      if (filters.startDate) {
        const start = new Date(filters.startDate);
        start.setHours(0, 0, 0, 0);
        if (new Date(item.receivedAt) < start) return false;
      }
      if (filters.endDate) {
        const end = new Date(filters.endDate);
        end.setHours(23, 59, 59, 999);
        if (new Date(item.receivedAt) > end) return false;
      }
      if (filters.customerId && item.customerId !== filters.customerId) {
        return false;
      }
      if (
        filters.technicianId &&
        !item.assignedTechnicianIds.includes(filters.technicianId)
      ) {
        return false;
      }
      if (filters.status && item.currentStatus !== filters.status) {
        return false;
      }
      if (filters.locationId && item.currentLocationId !== filters.locationId) {
        return false;
      }
      if (
        filters.componentType &&
        item.componentType.toLowerCase() !== filters.componentType.toLowerCase()
      ) {
        return false;
      }
      return true;
    });

    const kpis = {
      totalIncoming: filtered.length,
      inProgress: filtered.filter((i) =>
        ['INITIAL_INSPECTION', 'IN_PROGRESS', 'REWORK'].includes(i.currentStatus)
      ).length,
      waitingSparePart: filtered.filter((i) =>
        ['WAITING_FOR_SPARE_PART', 'ON_HOLD'].includes(i.currentStatus)
      ).length,
      waitingApproval: filtered.filter(
        (i) => i.currentStatus === 'WAITING_FOR_APPROVAL'
      ).length,
      inQualityControl: filtered.filter(
        (i) => i.currentStatus === 'QUALITY_CONTROL'
      ).length,
      completedReady: filtered.filter(
        (i) => i.currentStatus === 'READY_FOR_DELIVERY'
      ).length,
      delivered: filtered.filter((i) => i.currentStatus === 'DELIVERED').length,
      overdue: filtered.filter((i) => i.isOverdue).length,
    };

    // 1. Monthly Incoming (last 6 months based on real data)
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const now = new Date();
    const monthlyMap = new Map<string, number>();
    for (let m = 5; m >= 0; m--) {
      const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
      const key = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
      monthlyMap.set(key, 0);
    }
    for (const item of filtered) {
      const d = new Date(item.receivedAt);
      const key = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
      monthlyMap.set(key, (monthlyMap.get(key) || 0) + 1);
    }
    const monthlyIncoming = Array.from(monthlyMap.entries()).map(([month, count]) => ({
      month,
      count,
    }));

    // 2. Status Distribution
    const statusOrder: ItemStatus[] = [
      'RECEIVED',
      'INITIAL_INSPECTION',
      'WAITING_FOR_APPROVAL',
      'IN_PROGRESS',
      'WAITING_FOR_SPARE_PART',
      'QUALITY_CONTROL',
      'READY_FOR_DELIVERY',
      'DELIVERED',
      'ON_HOLD',
      'REWORK',
      'CANCELLED',
    ];
    const statusDistribution = statusOrder
      .map((st) => ({
        status: st,
        label: STATUS_LABELS[st],
        count: filtered.filter((i) => i.currentStatus === st).length,
      }))
      .filter((s) => s.count > 0);

    // 3. Average Repair Duration by Component Type (completed/delivered items or elapsed for active)
    const durationGroups = new Map<string, { totalDays: number; count: number }>();
    for (const item of filtered) {
      const endTs = item.completedAt
        ? new Date(item.completedAt).getTime()
        : item.deliveredAt
        ? new Date(item.deliveredAt).getTime()
        : Date.now();
      const startTs = new Date(item.receivedAt).getTime();
      const days = Math.max(0.2, (endTs - startTs) / (1000 * 60 * 60 * 24));
      const prev = durationGroups.get(item.componentType) || { totalDays: 0, count: 0 };
      durationGroups.set(item.componentType, {
        totalDays: prev.totalDays + days,
        count: prev.count + 1,
      });
    }
    const avgRepairDuration = Array.from(durationGroups.entries()).map(
      ([componentType, val]) => ({
        componentType,
        avgDays: Number((val.totalDays / val.count).toFixed(1)),
        completedCount: val.count,
      })
    );

    // 4. Technician Workload
    const technicians = allUsers.filter((u) => u.role === 'TEKNISI' && u.isActive);
    const technicianWorkload = technicians.map((tech) => {
      const assignedItems = filtered.filter((i) =>
        i.assignedTechnicianIds.includes(tech.id)
      );
      const activeCount = assignedItems.filter(
        (i) => !['READY_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'].includes(i.currentStatus)
      ).length;
      const completedCount = assignedItems.filter((i) =>
        ['READY_FOR_DELIVERY', 'DELIVERED'].includes(i.currentStatus)
      ).length;
      return {
        technicianId: tech.id,
        technicianName: tech.fullName,
        specialization: tech.specialization,
        activeCount,
        completedCount,
      };
    });

    // 5. Weekly Completed (last 6 weeks)
    const weeklyCompleted: { week: string; count: number }[] = [];
    for (let w = 5; w >= 0; w--) {
      const weekEnd = new Date(now.getTime() - w * 7 * 24 * 60 * 60 * 1000);
      const weekStart = new Date(weekEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
      const label = `${weekStart.getDate()}/${weekStart.getMonth() + 1}`;
      const count = filtered.filter((item) => {
        const doneDateStr = item.completedAt || item.deliveredAt;
        if (!doneDateStr) return false;
        const doneDate = new Date(doneDateStr);
        return doneDate >= weekStart && doneDate <= weekEnd;
      }).length;
      weeklyCompleted.push({ week: `Mg ${label}`, count });
    }

    return {
      kpis,
      charts: {
        monthlyIncoming,
        statusDistribution,
        avgRepairDuration,
        technicianWorkload,
        weeklyCompleted,
      },
      recentItems: filtered.slice(0, 10),
      overdueItems: filtered.filter((i) => i.isOverdue),
    };
  } catch (error) {
    wrapDbError(error, 'Gagal memuat analitik dashboard workshop.');
  }
}

export async function listNotificationsForUser(
  actor: UserProfile
): Promise<NotificationRecord[]> {
  try {
    const rows = await db
      .select()
      .from(notifications)
      .where(
        or(
          eq(notifications.targetRole, 'ALL'),
          eq(notifications.targetRole, actor.role),
          eq(notifications.targetUserId, actor.id)
        )
      )
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(50);

    return rows.map((r) => ({
      id: r.id,
      targetRole: r.targetRole,
      targetUserId: r.targetUserId,
      type: r.type,
      title: r.title,
      message: r.message,
      itemId: r.itemId,
      isRead: r.isRead,
      createdAt: r.createdAt.toISOString(),
    }));
  } catch (error) {
    wrapDbError(error, 'Gagal memuat notifikasi.');
  }
}

export async function markNotificationsRead(
  actor: UserProfile,
  notificationId?: number
): Promise<void> {
  try {
    if (notificationId) {
      await db
        .update(notifications)
        .set({ isRead: true })
        .where(eq(notifications.id, notificationId));
    } else {
      await db
        .update(notifications)
        .set({ isRead: true })
        .where(
          or(
            eq(notifications.targetRole, 'ALL'),
            eq(notifications.targetRole, actor.role),
            eq(notifications.targetUserId, actor.id)
          )
        );
    }
  } catch (error) {
    wrapDbError(error, 'Gagal memperbarui status baca notifikasi.');
  }
}

export async function getFullReportsBundle(): Promise<{
  workOrders: WorkOrderRecord[];
  items: WorkOrderItemSummary[];
  statusLogs: Array<
    typeof statusHistory.$inferSelect & { itemCode: string; itemName: string; woNumber: string }
  >;
  movementLogs: Array<
    typeof movementHistory.$inferSelect & { itemCode: string; itemName: string; woNumber: string }
  >;
  activities: Array<
    typeof repairActivities.$inferSelect & { itemCode: string; itemName: string; woNumber: string }
  >;
  auditLogs: AuditLogRecord[];
}> {
  try {
    const [woList, itemsList, sRows, mRows, aRows, auditRows] = await Promise.all([
      listWorkOrders(),
      listItems(),
      db.select().from(statusHistory).orderBy(desc(statusHistory.createdAt)),
      db.select().from(movementHistory).orderBy(desc(movementHistory.createdAt)),
      db.select().from(repairActivities).orderBy(desc(repairActivities.createdAt)),
      db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(200),
    ]);

    const itemMap = new Map(itemsList.map((i) => [i.id, i]));

    return {
      workOrders: woList,
      items: itemsList,
      statusLogs: sRows.map((s) => {
        const it = itemMap.get(s.itemId);
        return {
          ...s,
          itemCode: it?.itemCode || '-',
          itemName: it?.itemName || '-',
          woNumber: it?.woNumber || '-',
        };
      }),
      movementLogs: mRows.map((m) => {
        const it = itemMap.get(m.itemId);
        return {
          ...m,
          itemCode: it?.itemCode || '-',
          itemName: it?.itemName || '-',
          woNumber: it?.woNumber || '-',
        };
      }),
      activities: aRows.map((a) => {
        const it = itemMap.get(a.itemId);
        return {
          ...a,
          itemCode: it?.itemCode || '-',
          itemName: it?.itemName || '-',
          woNumber: it?.woNumber || '-',
        };
      }),
      auditLogs: auditRows.map((al) => ({
        id: al.id,
        actorUserId: al.actorUserId,
        actorName: al.actorName,
        actorRole: al.actorRole,
        action: al.action,
        entityType: al.entityType,
        entityId: al.entityId,
        details: al.details,
        createdAt: al.createdAt.toISOString(),
      })),
    };
  } catch (error) {
    wrapDbError(error, 'Gagal memuat data laporan dan audit log.');
  }
}

export async function seedOperationalSampleRecords(actor: UserProfile): Promise<void> {
  try {
    await ensureDefaultLocations();
    const locs = await listLocations(true);
    const findLoc = (keyword: string) =>
      locs.find((l) => l.name.toLowerCase().includes(keyword.toLowerCase()))?.id || locs[0]?.id;

    // Ensure sample technicians and supervisor exist
    const sampleStaff = [
      {
        email: 'ahmad.teknisi@workshoptrack.id',
        fullName: 'Ahmad Pratama',
        role: 'TEKNISI' as UserRole,
        specialization: 'Crankshaft Grinding & Balancing',
      },
      {
        email: 'budi.machining@workshoptrack.id',
        fullName: 'Budi Santoso',
        role: 'TEKNISI' as UserRole,
        specialization: 'CNC Line Boring & Machining',
      },
      {
        email: 'hendra.supervisor@workshoptrack.id',
        fullName: 'Hendra Wijaya',
        role: 'SUPERVISOR' as UserRole,
        specialization: 'Kepala Operasional Workshop',
      },
    ];

    for (const st of sampleStaff) {
      const ex = await db.select().from(users).where(eq(users.email, st.email)).limit(1);
      if (ex.length === 0) {
        await createEmployeeAccount(actor, st);
      }
    }

    const allUsers = await listUsers();
    const ahmad = allUsers.find((u) => u.email === 'ahmad.teknisi@workshoptrack.id');
    const budi = allUsers.find((u) => u.email === 'budi.machining@workshoptrack.id');

    const now = new Date();
    const plusDays = (d: number) => new Date(now.getTime() + d * 24 * 60 * 60 * 1000).toISOString();
    const minusDays = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000).toISOString();

    // Work Order 1: PT Contoh Industri - Crankshaft (Matches exact prompt example!)
    const wo1 = await createWorkOrderWithItems(actor, {
      newCustomer: {
        contactName: 'Ir. Darmawan Putra',
        companyName: 'PT Contoh Industri',
        phone: '021-89104422',
        email: 'maintenance@contohindustri.co.id',
      },
      receivedAt: minusDays(3),
      receiverName: actor.fullName,
      priority: 'HIGH',
      estimatedCompletion: plusDays(4),
      notes: 'Overhaul mesin genset utama pabrik Cikarang, toleransi standar OEM.',
      items: [
        {
          itemName: 'Crankshaft',
          componentType: 'Crankshaft & Camshaft',
          brandModel: 'Caterpillar 3512B',
          serialNumber: 'CAT-CS-88412',
          quantity: 1,
          initialDamage: 'Keausan journal bearing utama #3 dan indikasi unbalance putaran tinggi.',
          repairType: 'Grinding Journal, NDT Penetrant & Dynamic Balancing',
          physicalCondition: 'Permukaan pin journal baret halus, flensa utuh tanpa retak kasat mata.',
          locationId: findLoc('Receiving'),
          estimatedCompletion: plusDays(4),
        },
      ],
    });

    const crankItem = wo1.items[0];
    if (crankItem && ahmad) {
      await assignTechniciansToItem(actor, crankItem.id, {
        leadTechnicianId: ahmad.id,
        supportTechnicianIds: budi ? [budi.id] : [],
        jobType: 'Initial Inspection & Dynamic Balancing',
        repairType: 'Grinding Journal & Dynamic Balancing',
        activityNotes: 'Prioritaskan pemeriksaan keretakan radius fillet sebelum masuk mesin balancing.',
      });

      await moveItemLocation(actor, crankItem.id, {
        toLocationId: findLoc('Inspection')!,
        reason: 'Memulai tahap inspeksi dimensi dan uji penetrant',
      });

      await updateItemStatus(actor, crankItem.id, {
        newStatus: 'INITIAL_INSPECTION',
        notes: 'Pengukuran mikrometer pada main journal dan conrod journal selesai.',
      });

      await createDailyWorkActivity(actor, crankItem.id, {
        jobType: 'Initial Inspection & NDT',
        description:
          'Initial inspection meliputi pemeriksaan diameter bearing journal, bending, radius, serta crack inspection menggunakan metode penetrant testing.',
        inspectionResult:
          'Pemeriksaan awal selesai, run-out 0.04 mm masih dalam batas koreksi grinding undersize 0.25 mm.',
        issues: '',
      });

      await approveItemStage(actor, crankItem.id, {
        approvalType: 'INSPECTION',
        notes: 'Hasil inspeksi disetujui, lanjutkan ke proses pemesinan dan balancing.',
      });

      await moveItemLocation(actor, crankItem.id, {
        toLocationId: findLoc('Balancing')!,
        reason: 'Lanjut proses kalibrasi dynamic balancing setelah koreksi jurnal',
      });

      await updateItemStatus(actor, crankItem.id, {
        newStatus: 'IN_PROGRESS',
        notes: 'Proses koreksi jurnal selesai, sedang dikerjakan pada mesin Dynamic Balancing.',
      });
    }

    // Work Order 2: PT Krakatau Baja Mandiri - Hydraulic Cylinder & Gearbox (1 item overdue, 1 QC)
    const wo2 = await createWorkOrderWithItems(actor, {
      newCustomer: {
        contactName: 'Rizal Mahendra',
        companyName: 'PT Krakatau Baja Mandiri',
        phone: '0254-392118',
        email: 'plant.eng@krakataubajamandiri.co.id',
      },
      receivedAt: minusDays(8),
      receiverName: actor.fullName,
      priority: 'URGENT',
      estimatedCompletion: minusDays(1),
      notes: 'Komponen lini hot strip mill.',
      items: [
        {
          itemName: 'Main Hydraulic Press Cylinder',
          componentType: 'Hydraulic Cylinder & Pump',
          brandModel: 'Bosch Rexroth CDH2',
          serialNumber: 'RX-HYD-2091',
          quantity: 1,
          initialDamage: 'Kebocoran tekanan internal dan piston rod tergores dalam.',
          repairType: 'Hard Chrome Plating & Seal Kit Overhaul',
          physicalCondition: 'Rod baret memanjang 12 cm, eye bushing aus.',
          locationId: findLoc('Storage'),
          estimatedCompletion: minusDays(1),
        },
        {
          itemName: 'Helical Gearbox Housing',
          componentType: 'Industrial Gearbox',
          brandModel: 'Flender H2SH-13',
          serialNumber: 'FLN-77301',
          quantity: 1,
          initialDamage: 'Rumah bearing dudukan poros input longgar (oval 0.18 mm).',
          repairType: 'Welding Bore & CNC Line Boring',
          physicalCondition: 'Casing cast steel bersih, baut pengikat lengkap.',
          locationId: findLoc('Line Boring'),
          estimatedCompletion: plusDays(2),
        },
      ],
    });

    if (wo2.items[0] && budi) {
      await assignTechniciansToItem(actor, wo2.items[0].id, {
        leadTechnicianId: budi.id,
        jobType: 'Disassembly & Seal Replacement',
      });
      await updateItemStatus(actor, wo2.items[0].id, {
        newStatus: 'WAITING_FOR_SPARE_PART',
        notes: 'Menunggu kedatangan Viton high-temp seal kit OEM dari distributor.',
      });
    }

    if (wo2.items[1] && budi) {
      await assignTechniciansToItem(actor, wo2.items[1].id, {
        leadTechnicianId: budi.id,
        jobType: 'Line Boring',
      });
      await approveItemStage(actor, wo2.items[1].id, { approvalType: 'INSPECTION' });
      await moveItemLocation(actor, wo2.items[1].id, {
        toLocationId: findLoc('Quality Control')!,
        reason: 'Proses line boring selesai, pemeriksaan akhir bore gauge di QC',
      });
      await updateItemStatus(actor, wo2.items[1].id, {
        newStatus: 'QUALITY_CONTROL',
        notes: 'Diameter dudukan bearing telah presisi H7, masuk tahap Quality Control.',
      });
    }
  } catch (error) {
    wrapDbError(error, 'Gagal memuat contoh data operasional.');
  }
}
