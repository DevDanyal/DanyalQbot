import type { Client } from "@libsql/client";
import { getDb, isDbConfigured, ensureSchema } from "./db";

/**
 * Plans / licenses service.
 *
 * The license row is the authoritative record for what a customer is allowed
 * to do. `customers.expires_at` is mirrored from the license so the legacy
 * (cookie) login path and admin page keep working unchanged.
 */

export const EXPIRING_SOON_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

export type LicenseStatus = "ACTIVE" | "EXPIRING_SOON" | "EXPIRED" | "SUSPENDED";

export interface Plan {
  id: number;
  code: string;
  name: string;
  duration_days: number;
  device_limit: number;
  price_cents: number;
  description: string | null;
  status: "active" | "disabled";
  created_at: number;
  updated_at: number;
}

export interface License {
  id: number;
  license_id: string;
  customer_id: number;
  plan_id: number | null;
  status: "active" | "suspended" | "revoked";
  start_at: number;
  expires_at: number | null;
  device_limit: number;
  created_at: number;
  updated_at: number;
  plan: Plan | null;
}

export interface PublicLicense {
  licenseId: string;
  status: LicenseStatus;
  plan: { code: string; name: string } | null;
  startAt: number | null;
  expiresAt: number | null;
  deviceLimit: number;
}

export function deriveLicenseStatus(
  lic: Pick<License, "status" | "expires_at">,
  now = Date.now(),
): LicenseStatus {
  if (lic.status === "suspended" || lic.status === "revoked") return "SUSPENDED";
  if (lic.expires_at != null && lic.expires_at <= now) return "EXPIRED";
  if (lic.expires_at != null && lic.expires_at - now <= EXPIRING_SOON_MS) {
    return "EXPIRING_SOON";
  }
  return "ACTIVE";
}

export function toPublicLicense(lic: License): PublicLicense {
  return {
    licenseId: lic.license_id,
    status: deriveLicenseStatus(lic),
    plan: lic.plan ? { code: lic.plan.code, name: lic.plan.name } : null,
    startAt: lic.start_at ?? null,
    expiresAt: lic.expires_at ?? null,
    deviceLimit: lic.device_limit,
  };
}

// ---- Plans ----

async function rowToPlan(r: Record<string, unknown>): Promise<Plan> {
  return {
    id: Number(r.id),
    code: r.code as string,
    name: r.name as string,
    duration_days: Number(r.duration_days),
    device_limit: Number(r.device_limit),
    price_cents: Number(r.price_cents ?? 0),
    description: (r.description as string | null) ?? null,
    status: (r.status as "active" | "disabled") ?? "active",
    created_at: Number(r.created_at),
    updated_at: Number(r.updated_at),
  };
}

export async function listPlans(db?: Client): Promise<Plan[]> {
  if (!isDbConfigured() && !db) return [];
  await ensureSchema(db);
  const client = db ?? getDb();
  const res = await client.execute("SELECT * FROM plans ORDER BY id ASC");
  const out: Plan[] = [];
  for (const r of res.rows) out.push(await rowToPlan(r));
  return out;
}

export async function getPlanByCode(code: string, db?: Client): Promise<Plan | null> {
  if (!isDbConfigured() && !db) return null;
  await ensureSchema(db);
  const client = db ?? getDb();
  const res = await client.execute({
    sql: "SELECT * FROM plans WHERE code = ?",
    args: [code.trim().toUpperCase()],
  });
  if (res.rows.length === 0) return null;
  return rowToPlan(res.rows[0]);
}

export async function getPlanById(id: number, db?: Client): Promise<Plan | null> {
  if (!isDbConfigured() && !db) return null;
  await ensureSchema(db);
  const client = db ?? getDb();
  const res = await client.execute({ sql: "SELECT * FROM plans WHERE id = ?", args: [id] });
  if (res.rows.length === 0) return null;
  return rowToPlan(res.rows[0]);
}

export async function createPlan(
  opts: {
    code: string;
    name: string;
    durationDays: number;
    deviceLimit: number;
    priceCents?: number;
    description?: string;
  },
  db?: Client,
): Promise<Plan> {
  if (!isDbConfigured() && !db) throw new Error("Licensing DB not configured");
  await ensureSchema(db);
  const client = db ?? getDb();
  const now = Date.now();
  const res = await client.execute({
    sql: "INSERT INTO plans (code, name, duration_days, device_limit, price_cents, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)",
    args: [
      opts.code.trim().toUpperCase(),
      opts.name.trim(),
      opts.durationDays,
      opts.deviceLimit,
      opts.priceCents ?? 0,
      opts.description ?? null,
      now,
      now,
    ],
  });
  const id = Number(res.lastInsertRowid);
  const created = await getPlanById(id, db);
  if (!created) throw new Error("Failed to read back created plan");
  return created;
}

export async function updatePlan(
  id: number,
  patch: Partial<Pick<Plan, "name" | "duration_days" | "device_limit" | "price_cents" | "description" | "status">>,
  db?: Client,
): Promise<Plan | null> {
  if (!isDbConfigured() && !db) return null;
  await ensureSchema(db);
  const client = db ?? getDb();
  const existing = await getPlanById(id, db);
  if (!existing) return null;
  const sets: string[] = [];
  const args: (string | number)[] = [];
  const fields: (keyof typeof patch)[] = ["name", "duration_days", "device_limit", "price_cents", "description", "status"];
  for (const f of fields) {
    if (patch[f] !== undefined) {
      sets.push(`${f} = ?`);
      args.push(patch[f] as string | number);
    }
  }
  sets.push("updated_at = ?");
  args.push(Date.now());
  await client.execute({
    sql: `UPDATE plans SET ${sets.join(", ")} WHERE id = ?`,
    args: [...args, id],
  });
  return getPlanById(id, db);
}

// ---- Licenses ----

let _licenseIdCounter = 0;

export function newLicenseId(): string {
  _licenseIdCounter = (_licenseIdCounter + 1) % 900;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, "X");
  const n = String(100 + _licenseIdCounter);
  return `LIC-${rand}-${n}`;
}

function rowToLicense(r: Record<string, unknown>, plan: Plan | null): License {
  return {
    id: Number(r.id),
    license_id: r.license_id as string,
    customer_id: Number(r.customer_id),
    plan_id: r.plan_id == null ? null : Number(r.plan_id),
    status: (r.status as License["status"]) ?? "active",
    start_at: Number(r.start_at) || 0,
    expires_at: r.expires_at == null ? null : Number(r.expires_at),
    device_limit: Number(r.device_limit),
    created_at: Number(r.created_at),
    updated_at: Number(r.updated_at),
    plan,
  };
}

async function loadLicense(
  client: Client,
  where: string,
  args: (string | number)[],
): Promise<License | null> {
  const res = await client.execute({
    sql: `SELECT l.*, p.id AS p_id, p.code AS p_code, p.name AS p_name, p.duration_days AS p_duration_days, p.device_limit AS p_device_limit, p.price_cents AS p_price_cents, p.description AS p_description, p.status AS p_status, p.created_at AS p_created_at, p.updated_at AS p_updated_at FROM licenses l LEFT JOIN plans p ON p.id = l.plan_id WHERE ${where} LIMIT 1`,
    args,
  });
  if (res.rows.length === 0) return null;
  const r = res.rows[0];
  const plan: Plan | null = r.p_id == null ? null : {
    id: Number(r.p_id),
    code: r.p_code as string,
    name: r.p_name as string,
    duration_days: Number(r.p_duration_days),
    device_limit: Number(r.p_device_limit),
    price_cents: Number(r.p_price_cents ?? 0),
    description: (r.p_description as string | null) ?? null,
    status: (r.p_status as "active" | "disabled") ?? "active",
    created_at: Number(r.p_created_at),
    updated_at: Number(r.p_updated_at),
  };
  return rowToLicense(r, plan);
}

export async function getLicenseForCustomer(customerId: number, db?: Client): Promise<License | null> {
  if (!isDbConfigured() && !db) return null;
  await ensureSchema(db);
  const client = db ?? getDb();
  return loadLicense(client, "l.customer_id = ?", [customerId]);
}

export async function getLicenseById(id: number, db?: Client): Promise<License | null> {
  if (!isDbConfigured() && !db) return null;
  await ensureSchema(db);
  const client = db ?? getDb();
  return loadLicense(client, "l.id = ?", [id]);
}

export async function getLicenseByPublicId(licenseId: string, db?: Client): Promise<License | null> {
  if (!isDbConfigured() && !db) return null;
  await ensureSchema(db);
  const client = db ?? getDb();
  return loadLicense(client, "l.license_id = ?", [licenseId.trim().toUpperCase()]);
}

/**
 * Creates a license for a customer from a plan and mirrors the expiry back
 * onto the customer row (legacy compatibility).
 */
export async function createLicenseForCustomer(
  opts: {
    customerId: number;
    plan: Plan;
    startAt?: number;
    expiresAt?: number;
    licenseId?: string;
  },
  db?: Client,
): Promise<License> {
  if (!isDbConfigured() && !db) throw new Error("Licensing DB not configured");
  await ensureSchema(db);
  const client = db ?? getDb();
  const now = Date.now();
  const startAt = opts.startAt ?? now;
  const expiresAt =
    opts.expiresAt ?? (opts.plan.duration_days > 0 ? startAt + opts.plan.duration_days * 24 * 60 * 60 * 1000 : null);
  const licenseId = opts.licenseId ?? newLicenseId();

  const existing = await getLicenseForCustomer(opts.customerId, db);
  if (existing) {
    throw new Error("Customer already has a license.");
  }

  await client.batch([
    {
      sql: "INSERT INTO licenses (license_id, customer_id, plan_id, status, start_at, expires_at, device_limit, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?)",
      args: [licenseId, opts.customerId, opts.plan.id, startAt, expiresAt, opts.plan.device_limit, now, now],
    },
    // Mirror expiry onto customers for the legacy code paths.
    { sql: "UPDATE customers SET expires_at = ? WHERE id = ?", args: [expiresAt, opts.customerId] },
  ]);
  const lic = await getLicenseForCustomer(opts.customerId, db);
  if (!lic) throw new Error("Failed to read back created license");
  return lic;
}

export async function extendLicense(
  licenseId: number,
  days: number,
  db?: Client,
): Promise<License | null> {
  if (!isDbConfigured() && !db) return null;
  await ensureSchema(db);
  const client = db ?? getDb();
  const lic = await getLicenseById(licenseId, db);
  if (!lic) return null;
  const base = lic.expires_at ?? Date.now();
  const next = base + days * 24 * 60 * 60 * 1000;
  const now = Date.now();
  await client.batch([
    { sql: "UPDATE licenses SET expires_at = ?, updated_at = ? WHERE id = ?", args: [next, now, licenseId] },
    { sql: "UPDATE customers SET expires_at = ? WHERE id = ?", args: [next, lic.customer_id] },
  ]);
  return getLicenseById(licenseId, db);
}

export async function setLicenseExpiry(
  licenseId: number,
  expiresAt: number,
  db?: Client,
): Promise<License | null> {
  if (!isDbConfigured() && !db) return null;
  await ensureSchema(db);
  const client = db ?? getDb();
  const lic = await getLicenseById(licenseId, db);
  if (!lic) return null;
  const now = Date.now();
  await client.batch([
    { sql: "UPDATE licenses SET expires_at = ?, updated_at = ? WHERE id = ?", args: [expiresAt, now, licenseId] },
    { sql: "UPDATE customers SET expires_at = ? WHERE id = ?", args: [expiresAt, lic.customer_id] },
  ]);
  return getLicenseById(licenseId, db);
}

export async function setLicenseStatus(
  licenseId: number,
  status: "active" | "suspended" | "revoked",
  db?: Client,
): Promise<License | null> {
  if (!isDbConfigured() && !db) return null;
  await ensureSchema(db);
  const client = db ?? getDb();
  const lic = await getLicenseById(licenseId, db);
  if (!lic) return null;
  const now = Date.now();
  await client.batch([
    {
      sql: "UPDATE licenses SET status = ?, updated_at = ? WHERE id = ?",
      args: [status, now, licenseId],
    },
    // Suspended/revoked customers can no longer log in through the legacy
    // cookie path either.
    {
      sql: "UPDATE customers SET status = ? WHERE id = ?",
      args: [status === "active" ? "active" : "revoked", lic.customer_id],
    },
  ]);
  return getLicenseById(licenseId, db);
}

export async function changeLicensePlan(
  licenseId: number,
  planId: number,
  db?: Client,
): Promise<License | null> {
  if (!isDbConfigured() && !db) return null;
  await ensureSchema(db);
  const client = db ?? getDb();
  const lic = await getLicenseById(licenseId, db);
  const plan = await getPlanById(planId, db);
  if (!lic || !plan) return null;
  const now = Date.now();
  await client.execute({
    sql: "UPDATE licenses SET plan_id = ?, device_limit = ?, updated_at = ? WHERE id = ?",
    args: [planId, plan.device_limit, now, licenseId],
  });
  return getLicenseById(licenseId, db);
}

export async function listLicenses(
  opts: { status?: "active" | "suspended" | "revoked" | "expired"; limit?: number } = {},
  db?: Client,
): Promise<License[]> {
  if (!isDbConfigured() && !db) return [];
  await ensureSchema(db);
  const client = db ?? getDb();
  const clauses: string[] = [];
  const args: (string | number)[] = [];
  if (opts.status) {
    if (opts.status === "expired") {
      clauses.push("l.expires_at IS NOT NULL AND l.expires_at < ?");
      args.push(Date.now());
    } else {
      clauses.push("l.status = ?");
      args.push(opts.status);
    }
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const res = await client.execute({
    sql: `SELECT l.*, p.id AS p_id, p.code AS p_code, p.name AS p_name, p.duration_days AS p_duration_days, p.device_limit AS p_device_limit, p.price_cents AS p_price_cents, p.description AS p_description, p.status AS p_status, p.created_at AS p_created_at, p.updated_at AS p_updated_at FROM licenses l LEFT JOIN plans p ON p.id = l.plan_id ${where} ORDER BY l.created_at DESC LIMIT ?`,
    args: [...args, opts.limit ?? 200],
  });
  const out: License[] = [];
  for (const r of res.rows) {
    const plan: Plan | null = r.p_id == null ? null : {
      id: Number(r.p_id),
      code: r.p_code as string,
      name: r.p_name as string,
      duration_days: Number(r.p_duration_days),
      device_limit: Number(r.p_device_limit),
      price_cents: Number(r.p_price_cents ?? 0),
      description: (r.p_description as string | null) ?? null,
      status: (r.p_status as "active" | "disabled") ?? "active",
      created_at: Number(r.p_created_at),
      updated_at: Number(r.p_updated_at),
    };
    out.push(rowToLicense(r, plan));
  }
  return out;
}

export async function countLicensesByStatus(db?: Client): Promise<{
  active: number;
  expired: number;
  suspended: number;
  total: number;
}> {
  if (!isDbConfigured() && !db) return { active: 0, expired: 0, suspended: 0, total: 0 };
  await ensureSchema(db);
  const client = db ?? getDb();
  const now = Date.now();
  const res = await client.execute({
    sql: "SELECT status, expires_at FROM licenses",
  });
  let active = 0;
  let expired = 0;
  let suspended = 0;
  for (const r of res.rows) {
    const status = r.status as string;
    if (status === "suspended" || status === "revoked") {
      suspended += 1;
    } else if (r.expires_at != null && Number(r.expires_at) <= now) {
      expired += 1;
    } else {
      active += 1;
    }
  }
  return { active, expired, suspended, total: res.rows.length };
}