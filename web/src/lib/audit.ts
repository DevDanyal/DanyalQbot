import type { Client } from "@libsql/client";
import { getDb, isDbConfigured, ensureSchema } from "./db";

/**
 * Audit logging.
 *
 * security_logs  — auth failures, device changes, license/admin operations.
 * activity_logs  — benign user actions (login, logout, device seen).
 * Sensitive data (passwords, tokens, device keys) is never written.
 */

export interface AuditMeta {
  actorType?: "customer" | "admin" | "system";
  actorId?: number | null;
  actorRole?: "customer" | "admin" | "system";
  ip?: string | null;
  deviceFp?: string | null;
}

export async function logSecurity(
  action: string,
  detail: string,
  meta: AuditMeta = {},
  db?: Client,
): Promise<void> {
  if (!isDbConfigured() && !db) return;
  await ensureSchema(db);
  const client = db ?? getDb();
  await client.execute({
    sql: "INSERT INTO security_logs (actor_type, actor_id, actor_role, action, detail, ip, device_fp, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    args: [
      meta.actorType ?? "customer",
      meta.actorId ?? null,
      meta.actorRole ?? "customer",
      action,
      detail,
      meta.ip ?? null,
      meta.deviceFp ?? null,
      Date.now(),
    ],
  });
}

export async function logActivity(
  customerId: number,
  action: string,
  detail: string,
  meta: Record<string, unknown> = {},
  db?: Client,
): Promise<void> {
  if (!isDbConfigured() && !db) return;
  await ensureSchema(db);
  const client = db ?? getDb();
  await client.execute({
    sql: "INSERT INTO activity_logs (customer_id, action, detail, meta, created_at) VALUES (?, ?, ?, ?, ?)",
    args: [customerId, action, detail, JSON.stringify(meta), Date.now()],
  });
}

export interface SecurityLogRow {
  id: number;
  actor_type: string;
  actor_id: number | null;
  actor_role: string;
  action: string;
  detail: string | null;
  ip: string | null;
  device_fp: string | null;
  created_at: number;
}

export async function listSecurityLogs(
  opts: { limit?: number; actorId?: number } = {},
  db?: Client,
): Promise<SecurityLogRow[]> {
  if (!isDbConfigured() && !db) return [];
  await ensureSchema(db);
  const client = db ?? getDb();
  const clauses: string[] = [];
  const args: (string | number)[] = [];
  if (opts.actorId != null) {
    clauses.push("actor_id = ?");
    args.push(opts.actorId);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const res = await client.execute({
    sql: `SELECT id, actor_type, actor_id, actor_role, action, detail, ip, device_fp, created_at FROM security_logs ${where} ORDER BY created_at DESC LIMIT ?`,
    args: [...args, opts.limit ?? 200],
  });
  return res.rows.map((r) => ({
    id: Number(r.id),
    actor_type: r.actor_type as string,
    actor_id: r.actor_id == null ? null : Number(r.actor_id),
    actor_role: r.actor_role as string,
    action: r.action as string,
    detail: (r.detail as string | null) ?? null,
    ip: (r.ip as string | null) ?? null,
    device_fp: (r.device_fp as string | null) ?? null,
    created_at: Number(r.created_at),
  }));
}

export interface ActivityLogRow {
  id: number;
  customer_id: number | null;
  action: string;
  detail: string | null;
  meta: string | null;
  created_at: number;
}

export async function listActivityLogs(
  opts: { limit?: number; customerId?: number } = {},
  db?: Client,
): Promise<ActivityLogRow[]> {
  if (!isDbConfigured() && !db) return [];
  await ensureSchema(db);
  const client = db ?? getDb();
  const clauses: string[] = [];
  const args: (string | number)[] = [];
  if (opts.customerId != null) {
    clauses.push("customer_id = ?");
    args.push(opts.customerId);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const res = await client.execute({
    sql: `SELECT id, customer_id, action, detail, meta, created_at FROM activity_logs ${where} ORDER BY created_at DESC LIMIT ?`,
    args: [...args, opts.limit ?? 200],
  });
  return res.rows.map((r) => ({
    id: Number(r.id),
    customer_id: r.customer_id == null ? null : Number(r.customer_id),
    action: r.action as string,
    detail: (r.detail as string | null) ?? null,
    meta: (r.meta as string | null) ?? null,
    created_at: Number(r.created_at),
  }));
}