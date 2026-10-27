import { relations } from 'drizzle-orm';
import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

// 1. users
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Firebase Auth UID or pre-registered placeholder UID
  email: text('email').notNull().unique(),
  fullName: text('full_name').notNull(),
  role: text('role').notNull().default('TEKNISI'), // ADMIN | SUPERVISOR | TEKNISI | MANAJEMEN
  phone: text('phone').notNull().default(''),
  specialization: text('specialization').notNull().default('Umum'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 2. customers
export const customers = pgTable('customers', {
  id: serial('id').primaryKey(),
  customerCode: text('customer_code').notNull().unique(),
  contactName: text('contact_name').notNull(),
  companyName: text('company_name').notNull(),
  phone: text('phone').notNull().default(''),
  email: text('email').notNull().default(''),
  address: text('address').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 3. item_locations (Configurable physical workshop areas)
export const itemLocations = pgTable('item_locations', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 4. work_orders
export const workOrders = pgTable('work_orders', {
  id: serial('id').primaryKey(),
  woNumber: text('wo_number').notNull().unique(),
  customerId: integer('customer_id')
    .references(() => customers.id)
    .notNull(),
  receivedAt: timestamp('received_at').defaultNow().notNull(),
  receivedByUserId: integer('received_by_user_id')
    .references(() => users.id)
    .notNull(),
  receiverName: text('receiver_name').notNull(),
  priority: text('priority').notNull().default('NORMAL'), // LOW | NORMAL | HIGH | URGENT
  estimatedCompletion: timestamp('estimated_completion').notNull(),
  status: text('status').notNull().default('OPEN'), // OPEN | IN_PROGRESS | COMPLETED | DELIVERED | CANCELLED
  notes: text('notes').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 5. work_order_items
export const workOrderItems = pgTable('work_order_items', {
  id: serial('id').primaryKey(),
  workOrderId: integer('work_order_id')
    .references(() => workOrders.id)
    .notNull(),
  itemCode: text('item_code').notNull().unique(),
  qrToken: text('qr_token').notNull().unique(),
  itemName: text('item_name').notNull(),
  componentType: text('component_type').notNull(),
  brandModel: text('brand_model').notNull().default(''),
  serialNumber: text('serial_number').notNull().default(''),
  quantity: integer('quantity').notNull().default(1),
  initialDamage: text('initial_damage').notNull(),
  repairType: text('repair_type').notNull().default('Inspeksi & Evaluasi Awal'),
  physicalCondition: text('physical_condition').notNull(),
  currentStatus: text('current_status').notNull().default('RECEIVED'),
  currentLocationId: integer('current_location_id').references(
    () => itemLocations.id
  ),
  leadTechnicianId: integer('lead_technician_id').references(() => users.id),
  approvedStageProgress: integer('approved_stage_progress')
    .notNull()
    .default(10),
  inspectionApproved: boolean('inspection_approved').notNull().default(false),
  repairApproved: boolean('repair_approved').notNull().default(false),
  estimatedCompletion: timestamp('estimated_completion').notNull(),
  completedAt: timestamp('completed_at'),
  deliveredAt: timestamp('delivered_at'),
  additionalNotes: text('additional_notes').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 6. repair_activities
export const repairActivities = pgTable('repair_activities', {
  id: serial('id').primaryKey(),
  itemId: integer('item_id')
    .references(() => workOrderItems.id)
    .notNull(),
  technicianId: integer('technician_id')
    .references(() => users.id)
    .notNull(),
  technicianName: text('technician_name').notNull(),
  jobType: text('job_type').notNull(),
  description: text('description').notNull(),
  inspectionResult: text('inspection_result').notNull().default(''),
  issues: text('issues').notNull().default(''),
  isApproved: boolean('is_approved').notNull().default(false),
  approvedById: integer('approved_by_id').references(() => users.id),
  approvedByName: text('approved_by_name'),
  approvedAt: timestamp('approved_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 7. technician_assignments
export const technicianAssignments = pgTable('technician_assignments', {
  id: serial('id').primaryKey(),
  itemId: integer('item_id')
    .references(() => workOrderItems.id)
    .notNull(),
  technicianId: integer('technician_id')
    .references(() => users.id)
    .notNull(),
  technicianName: text('technician_name').notNull(),
  assignedById: integer('assigned_by_id')
    .references(() => users.id)
    .notNull(),
  assignedByName: text('assigned_by_name').notNull(),
  assignmentRole: text('assignment_role').notNull().default('LEAD'), // LEAD | SUPPORT
  jobType: text('job_type').notNull(),
  assignmentStatus: text('assignment_status').notNull().default('ACTIVE'), // ACTIVE | COMPLETED | REASSIGNED
  activityNotes: text('activity_notes').notNull().default(''),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 8. status_history
export const statusHistory = pgTable('status_history', {
  id: serial('id').primaryKey(),
  itemId: integer('item_id')
    .references(() => workOrderItems.id)
    .notNull(),
  previousStatus: text('previous_status'),
  newStatus: text('new_status').notNull(),
  changedByUserId: integer('changed_by_user_id')
    .references(() => users.id)
    .notNull(),
  changedByName: text('changed_by_name').notNull(),
  notes: text('notes').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 9. movement_history
export const movementHistory = pgTable('movement_history', {
  id: serial('id').primaryKey(),
  itemId: integer('item_id')
    .references(() => workOrderItems.id)
    .notNull(),
  fromLocationId: integer('from_location_id').references(
    () => itemLocations.id
  ),
  toLocationId: integer('to_location_id')
    .references(() => itemLocations.id)
    .notNull(),
  fromLocationName: text('from_location_name'),
  toLocationName: text('to_location_name').notNull(),
  movedByUserId: integer('moved_by_user_id')
    .references(() => users.id)
    .notNull(),
  movedByName: text('moved_by_name').notNull(),
  reason: text('reason').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 10. attachments
export const attachments = pgTable('attachments', {
  id: serial('id').primaryKey(),
  itemId: integer('item_id')
    .references(() => workOrderItems.id)
    .notNull(),
  activityId: integer('activity_id').references(() => repairActivities.id),
  category: text('category').notNull(), // INCOMING | BEFORE | DURING | AFTER
  fileName: text('file_name').notNull(),
  mimeType: text('mime_type').notNull(),
  dataUrl: text('data_url').notNull(),
  caption: text('caption').notNull().default(''),
  uploadedByUserId: integer('uploaded_by_user_id')
    .references(() => users.id)
    .notNull(),
  uploadedByName: text('uploaded_by_name').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 11. notifications
export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  targetRole: text('target_role'), // ALL | ADMIN | SUPERVISOR | TEKNISI | MANAJEMEN
  targetUserId: integer('target_user_id').references(() => users.id),
  type: text('type').notNull(),
  title: text('title').notNull(),
  message: text('message').notNull(),
  itemId: integer('item_id').references(() => workOrderItems.id),
  isRead: boolean('is_read').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 12. audit_logs
export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  actorUserId: integer('actor_user_id').references(() => users.id),
  actorName: text('actor_name').notNull(),
  actorRole: text('actor_role').notNull(),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  details: text('details').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  receivedWorkOrders: many(workOrders),
  leadItems: many(workOrderItems),
  assignments: many(technicianAssignments),
  activities: many(repairActivities),
}));

export const customersRelations = relations(customers, ({ many }) => ({
  workOrders: many(workOrders),
}));

export const itemLocationsRelations = relations(itemLocations, ({ many }) => ({
  items: many(workOrderItems),
}));

export const workOrdersRelations = relations(workOrders, ({ one, many }) => ({
  customer: one(customers, {
    fields: [workOrders.customerId],
    references: [customers.id],
  }),
  receivedBy: one(users, {
    fields: [workOrders.receivedByUserId],
    references: [users.id],
  }),
  items: many(workOrderItems),
}));

export const workOrderItemsRelations = relations(
  workOrderItems,
  ({ one, many }) => ({
    workOrder: one(workOrders, {
      fields: [workOrderItems.workOrderId],
      references: [workOrders.id],
    }),
    currentLocation: one(itemLocations, {
      fields: [workOrderItems.currentLocationId],
      references: [itemLocations.id],
    }),
    leadTechnician: one(users, {
      fields: [workOrderItems.leadTechnicianId],
      references: [users.id],
    }),
    activities: many(repairActivities),
    assignments: many(technicianAssignments),
    statusHistory: many(statusHistory),
    movementHistory: many(movementHistory),
    attachments: many(attachments),
  })
);

export const repairActivitiesRelations = relations(
  repairActivities,
  ({ one, many }) => ({
    item: one(workOrderItems, {
      fields: [repairActivities.itemId],
      references: [workOrderItems.id],
    }),
    technician: one(users, {
      fields: [repairActivities.technicianId],
      references: [users.id],
    }),
    attachments: many(attachments),
  })
);

export const technicianAssignmentsRelations = relations(
  technicianAssignments,
  ({ one }) => ({
    item: one(workOrderItems, {
      fields: [technicianAssignments.itemId],
      references: [workOrderItems.id],
    }),
    technician: one(users, {
      fields: [technicianAssignments.technicianId],
      references: [users.id],
    }),
  })
);

export const statusHistoryRelations = relations(statusHistory, ({ one }) => ({
  item: one(workOrderItems, {
    fields: [statusHistory.itemId],
    references: [workOrderItems.id],
  }),
  changedBy: one(users, {
    fields: [statusHistory.changedByUserId],
    references: [users.id],
  }),
}));

export const movementHistoryRelations = relations(
  movementHistory,
  ({ one }) => ({
    item: one(workOrderItems, {
      fields: [movementHistory.itemId],
      references: [workOrderItems.id],
    }),
    movedBy: one(users, {
      fields: [movementHistory.movedByUserId],
      references: [users.id],
    }),
  })
);

export const attachmentsRelations = relations(attachments, ({ one }) => ({
  item: one(workOrderItems, {
    fields: [attachments.itemId],
    references: [workOrderItems.id],
  }),
  activity: one(repairActivities, {
    fields: [attachments.activityId],
    references: [repairActivities.id],
  }),
}));
