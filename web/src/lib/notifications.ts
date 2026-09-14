import type { Client } from "@libsql/client";
import { getDb, isDbConfigured, ensureSchema } from "./db";

/**
 * Notifications service.
 *
 * System-generated alerts (license expiring, security, announcements)
 * plus admin broadcast announcements.
 */

export type NotificationType =
  | "license_expiring"
  | "license_expired"
  | "license_suspended"
  | "security_alert"
  | "announcement"
  | "device_registered"
  | "system";

export interface Notification {
  id: number;
  customer_id: number | null;
  type: NotificationType;
  title: string;
  body: string | null;
  is_read: boolean;
  created_at: number;
}

function rowToNotification(r: Record<string, unknown>): Notification {
  return {
    id: Number(r.id),
    customer_id: r.customer_id == null ? null : Number(r.customer_id),
    type: r.type as NotificationType,
    title: r.title as string,
    body: (r.body as string | null) ?? null,
    is_read: Number(r.is_read) === 1,
    created_at: Number(r.created_at),
  };
}

export async function createNotification(
  opts: {
    customerId: number;
    type: NotificationType;
    title: string;
    body?: string;
  },
  db?: Client,
): Promise<Notification> {
  if (!isDbConfigured() && !db) throw new Error("DB not configured");
  await ensureSchema(db);
  const client = db ?? getDb();
  const now = Date.now();
  const res = await client.execute({
    sql: "INSERT INTO notifications (customer_id, type, title, body, is_read, created_at) VALUES (?, ?, ?, ?, 0, ?)",
    args: [opts.customerId, opts.type, opts.title, opts.body ?? null, now],
  });
  return {
    id: Number(res.lastInsertRowid),
    customer_id: opts.customerId,
    type: opts.type,
    title: opts.title,
    body: opts.body ?? null,
    is_read: false,
    created_at: now,
  };
}

/**
 * De-duplicated notification: avoid spamming the same type for the same
 * customer within `dedupeWindowMs` (default: 6 hours).
 */
export async function createNotificationIfNew(
  opts: {
    customerId: number;
    type: NotificationType;
    title: string;
    body?: string;
    dedupeWindowMs?: number;
  },
  db?: Client,
): Promise<Notification | null> {
  if (!isDbConfigured() && !db) return null;
  await ensureSchema(db);
  const client = db ?? getDb();
  const window = opts.dedupeWindowMs ?? 6 * 60 * 60 * 1000;
  const cutoff = Date.now() - window;
  const existing = await client.execute({
    sql: "SELECT id FROM notifications WHERE customer_id = ? AND type = ? AND created_at > ? ORDER BY id DESC LIMIT 1",
    args: [opts.customerId, opts.type, cutoff],
  });
  if (existing.rows.length > 0) return null;
  return createNotification(opts, client);
}

export async function listNotifications(
  customerId: number,
  opts: { limit?: number; unreadOnly?: boolean } = {},
  db?: Client,
): Promise<Notification[]> {
  if (!isDbConfigured() && !db) return [];
  await ensureSchema(db);
  const client = db ?? getDb();
  const clauses = ["customer_id = ?"];
  const args: (number | string)[] = [customerId];
  if (opts.unreadOnly) {
    clauses.push("is_read = 0");
  }
  const where = clauses.join(" AND ");
  const res = await client.execute({
    sql: `SELECT * FROM notifications WHERE ${where} ORDER BY created_at DESC LIMIT ?`,
    args: [...args, opts.limit ?? 50],
  });
  return res.rows.map((r) => rowToNotification(r));
}

export async function unreadCount(
  customerId: number,
  db?: Client,
): Promise<number> {
  if (!isDbConfigured() && !db) return 0;
  await ensureSchema(db);
  const client = db ?? getDb();
  const res = await client.execute({
    sql: "SELECT COUNT(*) AS n FROM notifications WHERE customer_id = ? AND is_read = 0",
    args: [customerId],
  });
  return Number(res.rows[0]?.n ?? 0);
}

export async function markRead(
  notificationId: number,
  customerId: number,
  db?: Client,
): Promise<boolean> {
  if (!isDbConfigured() && !db) return false;
  await ensureSchema(db);
  const client = db ?? getDb();
  const res = await client.execute({
    sql: "UPDATE notifications SET is_read = 1 WHERE id = ? AND customer_id = ?",
    args: [notificationId, customerId],
  });
  return (res.rowsAffected ?? 0) > 0;
}

export async function markAllRead(
  customerId: number,
  db?: Client,
): Promise<number> {
  if (!isDbConfigured() && !db) return 0;
  await ensureSchema(db);
  const client = db ?? getDb();
  const res = await client.execute({
    sql: "UPDATE notifications SET is_read = 1 WHERE customer_id = ? AND is_read = 0",
    args: [customerId],
  });
  return res.rowsAffected ?? 0;
}

export async function listAllNotifications(
  opts: { limit?: number } = {},
  db?: Client,
): Promise<Notification[]> {
  if (!isDbConfigured() && !db) return [];
  await ensureSchema(db);
  const client = db ?? getDb();
  const res = await client.execute({
    sql: "SELECT * FROM notifications ORDER BY created_at DESC LIMIT ?",
    args: [opts.limit ?? 200],
  });
  return res.rows.map((r) => rowToNotification(r));
}

/**
 * Admin announcement: create the same notification for every customer.
 * Returns the number of notifications created.
 */
export async function announceToAll(
  title: string,
  body: string,
  db?: Client,
): Promise<number> {
  if (!isDbConfigured() && !db) return 0;
  await ensureSchema(db);
  const client = db ?? getDb();
  const now = Date.now();
  const customers = await client.execute("SELECT id FROM customers WHERE status = 'active'");
  if (customers.rows.length === 0) return 0;
  const stmts = customers.rows.map((r) => ({
    sql: "INSERT INTO notifications (customer_id, type, title, body, is_read, created_at) VALUES (?, 'announcement', ?, ?, 0, ?)",
    args: [Number(r.id), title, body, now],
  }));
  await client.batch(stmts);
  return stmts.length;
}
