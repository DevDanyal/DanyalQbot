import { getDb, isDbConfigured, hashPassword, ensureSchema } from "./db";

export interface Customer {
  id: number;
  user_id: string;
  name: string;
  status: string;
  expires_at: number | null;
  device_id: string | null;
  created_at: number;
  last_login: number | null;
  last_ip: string | null;
}

export interface PublicCustomer {
  id: number;
  userId: string;
  name: string;
  status: string;
  effectiveStatus: string;
  expiresAt: Date | null;
  deviceId: string | null;
  createdAt: Date;
  lastLogin: Date | null;
}

function toPublic(c: Customer): PublicCustomer {
  const expiresAt = c.expires_at ? new Date(c.expires_at) : null;
  const isExpired = expiresAt != null && expiresAt.getTime() <= Date.now();
  const effectiveStatus =
    c.status === "active" && isExpired ? "expired" : c.status;
  return {
    id: c.id,
    userId: c.user_id,
    name: c.name,
    status: c.status,
    effectiveStatus,
    expiresAt,
    deviceId: c.device_id,
    createdAt: new Date(c.created_at),
    lastLogin: c.last_login ? new Date(c.last_login) : null,
  };
}

export async function createCustomer(opts: {
  userId: string;
  name: string;
  password: string;
  expiresAt: Date | null;
}): Promise<PublicCustomer> {
  await ensureSchema();
  const db = getDb();
  const hash = hashPassword(opts.password);
  const now = Date.now();
  const res = await db.execute({
    sql: "INSERT INTO customers (user_id, name, password_hash, status, expires_at, created_at) VALUES (?, ?, ?, 'active', ?, ?)",
    args: [opts.userId, opts.name, hash, opts.expiresAt ? opts.expiresAt.getTime() : null, now],
  });
  const id = Number(res.lastInsertRowid);
  return toPublic({
    id,
    user_id: opts.userId,
    name: opts.name,
    status: "active",
    expires_at: opts.expiresAt ? opts.expiresAt.getTime() : null,
    device_id: null,
    created_at: now,
    last_login: null,
    last_ip: null,
  });
}

export async function listCustomers(): Promise<PublicCustomer[]> {
  if (!isDbConfigured()) return [];
  await ensureSchema();
  const db = getDb();
  const res = await db.execute("SELECT * FROM customers ORDER BY id DESC");
  return res.rows.map((r) =>
    toPublic({
      id: Number(r.id),
      user_id: r.user_id as string,
      name: r.name as string,
      status: r.status as string,
      expires_at: r.expires_at == null ? null : Number(r.expires_at),
      device_id: (r.device_id as string | null) ?? null,
      created_at: Number(r.created_at),
      last_login: r.last_login == null ? null : Number(r.last_login),
      last_ip: (r.last_ip as string | null) ?? null,
    }),
  );
}

export async function findCustomerByUserId(userId: string): Promise<(Customer & { password_hash: string }) | null> {
  if (!isDbConfigured()) return null;
  await ensureSchema();
  const db = getDb();
  const res = await db.execute({
    sql: "SELECT * FROM customers WHERE user_id = ?",
    args: [userId.trim().toUpperCase()],
  });
  if (res.rows.length === 0) return null;
  const r = res.rows[0];
  return {
    id: Number(r.id),
    user_id: r.user_id as string,
    name: r.name as string,
    password_hash: r.password_hash as string,
    status: r.status as string,
    expires_at: r.expires_at == null ? null : Number(r.expires_at),
    device_id: (r.device_id as string | null) ?? null,
    created_at: Number(r.created_at),
    last_login: r.last_login == null ? null : Number(r.last_login),
    last_ip: (r.last_ip as string | null) ?? null,
  };
}

export async function findCustomerById(id: number): Promise<Customer | null> {
  if (!isDbConfigured()) return null;
  await ensureSchema();
  const db = getDb();
  const res = await db.execute({ sql: "SELECT * FROM customers WHERE id = ?", args: [id] });
  if (res.rows.length === 0) return null;
  const r = res.rows[0];
  return {
    id: Number(r.id),
    user_id: r.user_id as string,
    name: r.name as string,
    status: r.status as string,
    expires_at: r.expires_at == null ? null : Number(r.expires_at),
    device_id: (r.device_id as string | null) ?? null,
    created_at: Number(r.created_at),
    last_login: r.last_login == null ? null : Number(r.last_login),
    last_ip: (r.last_ip as string | null) ?? null,
  };
}

export async function updateCustomerStatus(id: number, status: string): Promise<void> {
  await ensureSchema();
  const db = getDb();
  await db.execute({ sql: "UPDATE customers SET status = ? WHERE id = ?", args: [status, id] });
}

export async function extendCustomerExpiry(id: number, days: number): Promise<Customer | null> {
  await ensureSchema();
  const db = getDb();
  const existing = await findCustomerById(id);
  if (!existing) return null;
  const base = existing.expires_at ?? Date.now();
  const next = base + days * 24 * 60 * 60 * 1000;
  await db.execute({ sql: "UPDATE customers SET expires_at = ? WHERE id = ?", args: [next, id] });
  return findCustomerById(id);
}

export async function bindDevice(id: number, deviceId: string): Promise<void> {
  await ensureSchema();
  const db = getDb();
  await db.execute({ sql: "UPDATE customers SET device_id = ? WHERE id = ?", args: [deviceId, id] });
}

export async function recordLogin(id: number, ip: string | null): Promise<void> {
  await ensureSchema();
  const db = getDb();
  await db.execute({
    sql: "UPDATE customers SET last_login = ?, last_ip = ? WHERE id = ?",
    args: [Date.now(), ip, id],
  });
}
