import type { Pool as PgPool } from 'pg';

const BOOTSTRAP_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS "users" (
    "id" serial PRIMARY KEY NOT NULL,
    "uid" text NOT NULL UNIQUE,
    "email" text NOT NULL UNIQUE,
    "full_name" text NOT NULL,
    "role" text DEFAULT 'TEKNISI' NOT NULL,
    "phone" text DEFAULT '' NOT NULL,
    "specialization" text DEFAULT 'Umum' NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS "customers" (
    "id" serial PRIMARY KEY NOT NULL,
    "customer_code" text NOT NULL UNIQUE,
    "contact_name" text NOT NULL,
    "company_name" text NOT NULL,
    "phone" text DEFAULT '' NOT NULL,
    "email" text DEFAULT '' NOT NULL,
    "address" text DEFAULT '' NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS "item_locations" (
    "id" serial PRIMARY KEY NOT NULL,
    "code" text NOT NULL UNIQUE,
    "name" text NOT NULL,
    "description" text DEFAULT '' NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS "work_orders" (
    "id" serial PRIMARY KEY NOT NULL,
    "wo_number" text NOT NULL UNIQUE,
    "customer_id" integer NOT NULL REFERENCES "customers"("id"),
    "received_at" timestamp DEFAULT now() NOT NULL,
    "received_by_user_id" integer NOT NULL REFERENCES "users"("id"),
    "receiver_name" text NOT NULL,
    "priority" text DEFAULT 'NORMAL' NOT NULL,
    "estimated_completion" timestamp NOT NULL,
    "status" text DEFAULT 'OPEN' NOT NULL,
    "notes" text DEFAULT '' NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS "work_order_items" (
    "id" serial PRIMARY KEY NOT NULL,
    "work_order_id" integer NOT NULL REFERENCES "work_orders"("id"),
    "item_code" text NOT NULL UNIQUE,
    "qr_token" text NOT NULL UNIQUE,
    "item_name" text NOT NULL,
    "component_type" text NOT NULL,
    "brand_model" text DEFAULT '' NOT NULL,
    "serial_number" text DEFAULT '' NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "initial_damage" text NOT NULL,
    "repair_type" text DEFAULT 'Inspeksi & Evaluasi Awal' NOT NULL,
    "physical_condition" text NOT NULL,
    "current_status" text DEFAULT 'RECEIVED' NOT NULL,
    "current_location_id" integer REFERENCES "item_locations"("id"),
    "lead_technician_id" integer REFERENCES "users"("id"),
    "approved_stage_progress" integer DEFAULT 10 NOT NULL,
    "inspection_approved" boolean DEFAULT false NOT NULL,
    "repair_approved" boolean DEFAULT false NOT NULL,
    "estimated_completion" timestamp NOT NULL,
    "completed_at" timestamp,
    "delivered_at" timestamp,
    "additional_notes" text DEFAULT '' NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS "repair_activities" (
    "id" serial PRIMARY KEY NOT NULL,
    "item_id" integer NOT NULL REFERENCES "work_order_items"("id"),
    "technician_id" integer NOT NULL REFERENCES "users"("id"),
    "technician_name" text NOT NULL,
    "job_type" text NOT NULL,
    "description" text NOT NULL,
    "inspection_result" text DEFAULT '' NOT NULL,
    "issues" text DEFAULT '' NOT NULL,
    "is_approved" boolean DEFAULT false NOT NULL,
    "approved_by_id" integer REFERENCES "users"("id"),
    "approved_by_name" text,
    "approved_at" timestamp,
    "created_at" timestamp DEFAULT now() NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS "technician_assignments" (
    "id" serial PRIMARY KEY NOT NULL,
    "item_id" integer NOT NULL REFERENCES "work_order_items"("id"),
    "technician_id" integer NOT NULL REFERENCES "users"("id"),
    "technician_name" text NOT NULL,
    "assigned_by_id" integer NOT NULL REFERENCES "users"("id"),
    "assigned_by_name" text NOT NULL,
    "assignment_role" text DEFAULT 'LEAD' NOT NULL,
    "job_type" text NOT NULL,
    "assignment_status" text DEFAULT 'ACTIVE' NOT NULL,
    "activity_notes" text DEFAULT '' NOT NULL,
    "started_at" timestamp DEFAULT now() NOT NULL,
    "completed_at" timestamp,
    "created_at" timestamp DEFAULT now() NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS "status_history" (
    "id" serial PRIMARY KEY NOT NULL,
    "item_id" integer NOT NULL REFERENCES "work_order_items"("id"),
    "previous_status" text,
    "new_status" text NOT NULL,
    "changed_by_user_id" integer NOT NULL REFERENCES "users"("id"),
    "changed_by_name" text NOT NULL,
    "notes" text NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS "movement_history" (
    "id" serial PRIMARY KEY NOT NULL,
    "item_id" integer NOT NULL REFERENCES "work_order_items"("id"),
    "from_location_id" integer REFERENCES "item_locations"("id"),
    "to_location_id" integer NOT NULL REFERENCES "item_locations"("id"),
    "from_location_name" text,
    "to_location_name" text NOT NULL,
    "moved_by_user_id" integer NOT NULL REFERENCES "users"("id"),
    "moved_by_name" text NOT NULL,
    "reason" text NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS "attachments" (
    "id" serial PRIMARY KEY NOT NULL,
    "item_id" integer NOT NULL REFERENCES "work_order_items"("id"),
    "activity_id" integer REFERENCES "repair_activities"("id"),
    "category" text NOT NULL,
    "file_name" text NOT NULL,
    "mime_type" text NOT NULL,
    "data_url" text NOT NULL,
    "caption" text DEFAULT '' NOT NULL,
    "uploaded_by_user_id" integer NOT NULL REFERENCES "users"("id"),
    "uploaded_by_name" text NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS "notifications" (
    "id" serial PRIMARY KEY NOT NULL,
    "target_role" text,
    "target_user_id" integer REFERENCES "users"("id"),
    "type" text NOT NULL,
    "title" text NOT NULL,
    "message" text NOT NULL,
    "item_id" integer REFERENCES "work_order_items"("id"),
    "is_read" boolean DEFAULT false NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS "audit_logs" (
    "id" serial PRIMARY KEY NOT NULL,
    "actor_user_id" integer REFERENCES "users"("id"),
    "actor_name" text NOT NULL,
    "actor_role" text NOT NULL,
    "action" text NOT NULL,
    "entity_type" text NOT NULL,
    "entity_id" text NOT NULL,
    "details" text NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
  );`,
];

let schemaBootstrappedPromise: Promise<void> | null = null;

export function isMissingRelationError(err: unknown): boolean {
  if (!err || typeof err !== 'object') {
    return false;
  }
  const pgErr = err as { code?: unknown; cause?: unknown; message?: unknown };
  if (pgErr.code === '42P01') {
    return true;
  }
  if (
    typeof pgErr.message === 'string' &&
    /relation\s+"[^"]+"\s+does not exist/i.test(pgErr.message)
  ) {
    return true;
  }
  if (pgErr.cause && pgErr.cause !== err) {
    return isMissingRelationError(pgErr.cause);
  }
  return false;
}

export async function ensurePostgresSchema(pool: PgPool): Promise<void> {
  if (!schemaBootstrappedPromise) {
    schemaBootstrappedPromise = (async () => {
      const client = await pool.connect();
      try {
        for (const sql of BOOTSTRAP_STATEMENTS) {
          await client.query(sql);
        }
      } finally {
        client.release();
      }
    })().catch((err) => {
      schemaBootstrappedPromise = null;
      throw err;
    });
  }
  await schemaBootstrappedPromise;
}
