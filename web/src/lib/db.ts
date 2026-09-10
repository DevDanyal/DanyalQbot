import { createClient, type Client } from "@libsql/client";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "crypto";

/**
 * Persistent storage for the license / login system.
 * Uses Turso (serverless libSQL, SQLite-compatible) so data survives
 * Vercel's serverless cold starts. Runtime-provided client.
 */

const url = process.env.TURSO_DATABASE_URL;
const token = process.env.TURSO_AUTH_TOKEN;

export function isDbConfigured(): boolean {
  return Boolean(url && token);
}

let _client: Client | null = null;

export function getDb(): Client {
  if (!isDbConfigured()) {
    throw new Error(
      "Licensing database is not configured. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN.",
    );
  }
  if (!_client) {
    _client = createClient({ url: url as string, authToken: token as string });
  }
  return _client;
}

let _schemaPromise: Promise<void> | null = null;

export function ensureSchema(db?: Client): Promise<void> {
  if (!isDbConfigured() && !db) return Promise.resolve();
  if (db) return initSchema(db).catch((err) => {
    throw err;
  });
  if (!_schemaPromise) {
    _schemaPromise = initSchema().catch((err) => {
      _schemaPromise = null;
      throw err;
    });
  }
  return _schemaPromise;
}

/**
 * Ensures a column exists on an existing table. libSQL/SQLite cannot add
 * columns inside CREATE TABLE IF NOT EXISTS, so additive migrations are
 * applied separately whenever the schema is initialized.
 */
export async function ensureColumn(
  db: Client,
  table: string,
  column: string,
  ddl: string,
): Promise<void> {
  const info = await db.execute(`PRAGMA table_info(${table})`);
  const exists = info.rows.some((r) => r.name === column);
  if (!exists) {
    await db.execute(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

export async function initSchema(db?: Client): Promise<void> {
  if (!isDbConfigured() && !db) return;
  const client = db ?? getDb();
  await client.batch([
    `CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      expires_at INTEGER,
      device_id TEXT,
      created_at INTEGER NOT NULL,
      last_login INTEGER,
      last_ip TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL DEFAULT 'customer',
      device_fp TEXT,
      ip TEXT,
      user_agent TEXT,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS login_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bucket TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      window_start INTEGER NOT NULL,
      locked_until INTEGER
    )`,
    `CREATE TABLE IF NOT EXISTS quotex_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      email TEXT NOT NULL,
      password_enc TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'demo',
      is_active INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      duration_days INTEGER NOT NULL,
      device_limit INTEGER NOT NULL DEFAULT 1,
      price_cents INTEGER NOT NULL DEFAULT 0,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS licenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      license_id TEXT NOT NULL UNIQUE,
      customer_id INTEGER NOT NULL,
      plan_id INTEGER,
      status TEXT NOT NULL DEFAULT 'active',
      start_at INTEGER NOT NULL,
      expires_at INTEGER,
      device_limit INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
      FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE SET NULL
    )`,
    `CREATE TABLE IF NOT EXISTS devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      license_id INTEGER,
      device_key_hash TEXT NOT NULL,
      label TEXT,
      platform TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      first_seen_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      last_ip TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
      FOREIGN KEY (license_id) REFERENCES licenses(id) ON DELETE SET NULL
    )`,
    `CREATE TABLE IF NOT EXISTS security_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_type TEXT NOT NULL DEFAULT 'customer',
      actor_id INTEGER,
      actor_role TEXT NOT NULL DEFAULT 'customer',
      action TEXT NOT NULL,
      detail TEXT,
      ip TEXT,
      device_fp TEXT,
      created_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER,
      action TEXT NOT NULL,
      detail TEXT,
      meta TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_attempts_bucket ON login_attempts(bucket)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_licenses_customer ON licenses(customer_id)`,
    `CREATE INDEX IF NOT EXISTS idx_licenses_status ON licenses(status)`,
    `CREATE INDEX IF NOT EXISTS idx_devices_customer ON devices(customer_id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_customer_key ON devices(customer_id, device_key_hash)`,
    `CREATE INDEX IF NOT EXISTS idx_security_logs_created ON security_logs(created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_security_logs_actor ON security_logs(actor_id, actor_role)`,
    `CREATE INDEX IF NOT EXISTS idx_activity_logs_customer ON activity_logs(customer_id, created_at)`,
  ]);

  // Additive migration: newer attributes on sessions. The sessions table may
  // already exist in production without these columns.
  await ensureColumn(client, "sessions", "device_fp", "device_fp TEXT");
  await ensureColumn(client, "sessions", "ip", "ip TEXT");
  await ensureColumn(client, "sessions", "user_agent", "user_agent TEXT");

  await seedDefaultPlans(client);
}

// ---- Default plans ----

const DEFAULT_PLANS = [
  { code: "FREE", name: "Free", duration_days: 7, device_limit: 1, price_cents: 0, description: "Basic features for 7 days, 1 device." },
  { code: "PRO", name: "Pro", duration_days: 30, device_limit: 1, price_cents: 0, description: "Full features for 30 days, 1 device." },
  { code: "PREMIUM", name: "Premium", duration_days: 90, device_limit: 1, price_cents: 0, description: "Full features for 90 days, priority support." },
  { code: "YEARLY", name: "Yearly", duration_days: 365, device_limit: 2, price_cents: 0, description: "Full features for 365 days, up to 2 devices." },
] as const;

export async function seedDefaultPlans(db?: Client): Promise<void> {
  if (!isDbConfigured() && !db) return;
  const client = db ?? getDb();
  const now = Date.now();
  await client.batch(
    DEFAULT_PLANS.map((p) => ({
      sql:
        "INSERT OR IGNORE INTO plans (code, name, duration_days, device_limit, price_cents, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)",
      args: [p.code, p.name, p.duration_days, p.device_limit, p.price_cents, p.description, now, now],
    })),
  );
}

// ---- Password hashing (Node built-in scrypt) ----

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [salt, hash] = stored.split(":");
    if (!salt || !hash) return false;
    const candidate = scryptSync(password, salt, 64);
    const expected = Buffer.from(hash, "hex");
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}

// ---- Secret encryption (AES-256-GCM) ----
// ENCRYPTION_KEY is a base64-encoded 32-byte key. Buyer Quotex passwords
// are encrypted at rest and only decrypted in-memory when the bot starts.

const ENC_KEY = process.env.ENCRYPTION_KEY ?? "";

export function isEncryptionConfigured(): boolean {
  return ENC_KEY.length > 0;
}

function encryptionKey(): Buffer {
  const key = Buffer.from(ENC_KEY, "base64");
  if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be a 32-byte base64 key.");
  }
  return key;
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${enc.toString("base64")}`;
}

export function decryptSecret(packed: string): string {
  const [ivB, tagB, dataB] = packed.split(".");
  if (!ivB || !tagB || !dataB) throw new Error("Invalid encrypted payload.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivB, "base64"));
  decipher.setAuthTag(Buffer.from(tagB, "base64"));
  const out = Buffer.concat([
    decipher.update(Buffer.from(dataB, "base64")),
    decipher.final(),
  ]);
  return out.toString("utf8");
}

// ---- Buyer Quotex accounts ----

export interface QuotexAccountRow {
  id: number;
  customerId: number;
  email: string;
  passwordEnc: string;
  mode: "demo" | "live";
  isActive: boolean;
  createdAt: number;
}

export async function listQuotexAccounts(customerId: number): Promise<Omit<QuotexAccountRow, "passwordEnc">[]> {
  await ensureSchema();
  const db = getDb();
  const res = await db.execute({
    sql: "SELECT id, customer_id, email, mode, is_active, created_at FROM quotex_accounts WHERE customer_id = ? ORDER BY id DESC",
    args: [customerId],
  });
  return res.rows.map((r) => ({
    id: Number(r.id),
    customerId: Number(r.customer_id),
    email: r.email as string,
    mode: r.mode as "demo" | "live",
    isActive: Number(r.is_active) === 1,
    createdAt: Number(r.created_at),
  }));
}

export async function getQuotexAccount(id: number, customerId: number): Promise<QuotexAccountRow | null> {
  await ensureSchema();
  const db = getDb();
  const res = await db.execute({
    sql: "SELECT * FROM quotex_accounts WHERE id = ? AND customer_id = ?",
    args: [id, customerId],
  });
  if (res.rows.length === 0) return null;
  const r = res.rows[0];
  return {
    id: Number(r.id),
    customerId: Number(r.customer_id),
    email: r.email as string,
    passwordEnc: r.password_enc as string,
    mode: r.mode as "demo" | "live",
    isActive: Number(r.is_active) === 1,
    createdAt: Number(r.created_at),
  };
}

export async function getActiveQuotexAccount(customerId: number): Promise<QuotexAccountRow | null> {
  await ensureSchema();
  const db = getDb();
  const res = await db.execute({
    sql: "SELECT * FROM quotex_accounts WHERE customer_id = ? AND is_active = 1 LIMIT 1",
    args: [customerId],
  });
  if (res.rows.length === 0) return null;
  const r = res.rows[0];
  return {
    id: Number(r.id),
    customerId: Number(r.customer_id),
    email: r.email as string,
    passwordEnc: r.password_enc as string,
    mode: r.mode as "demo" | "live",
    isActive: true,
    createdAt: Number(r.created_at),
  };
}

export async function saveQuotexAccount(
  customerId: number,
  email: string,
  password: string,
  mode: "demo" | "live",
): Promise<number> {
  await ensureSchema();
  if (!isEncryptionConfigured()) {
    throw new Error("ENCRYPTION_KEY is not configured on the server.");
  }
  const db = getDb();
  const now = Date.now();
  const enc = encryptSecret(password);
  await db.execute({
    sql: "UPDATE quotex_accounts SET is_active = 0 WHERE customer_id = ?",
    args: [customerId],
  });
  const res = await db.execute({
    sql: "INSERT INTO quotex_accounts (customer_id, email, password_enc, mode, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)",
    args: [customerId, email.trim(), enc, mode, now, now],
  });
  return Number(res.lastInsertRowid);
}

export async function deleteQuotexAccount(id: number, customerId: number): Promise<void> {
  await ensureSchema();
  const db = getDb();
  await db.execute({
    sql: "DELETE FROM quotex_accounts WHERE id = ? AND customer_id = ?",
    args: [id, customerId],
  });
}

export async function setActiveQuotexAccount(id: number, customerId: number): Promise<void> {
  await ensureSchema();
  const db = getDb();
  await db.batch([
    { sql: "UPDATE quotex_accounts SET is_active = 0 WHERE customer_id = ?", args: [customerId] },
    { sql: "UPDATE quotex_accounts SET is_active = 1 WHERE id = ? AND customer_id = ?", args: [id, customerId] },
  ]);
}

// ---- Session tokens ----

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newSessionToken(): string {
  return randomBytes(32).toString("hex");
}

export interface SessionUser {
  customerId: number;
  userId: string;
  name: string;
  role: "customer" | "admin";
}

export async function createSession(
  customerId: number | null,
  role: "customer" | "admin",
  ttlMs: number,
  meta?: { deviceFp?: string; ip?: string; userAgent?: string },
  db?: Client,
): Promise<string> {
  await ensureSchema(db);
  const client = db ?? getDb();
  const token = newSessionToken();
  const now = Date.now();
  await client.execute({
    sql: "INSERT INTO sessions (customer_id, token_hash, role, device_fp, ip, user_agent, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    args: [
      customerId ?? 0,
      hashToken(token),
      role,
      meta?.deviceFp ?? null,
      meta?.ip ?? null,
      meta?.userAgent ?? null,
      now,
      now + ttlMs,
    ],
  });
  return token;
}

export interface SessionRow {
  id: number;
  customerId: number;
  tokenHash: string;
  role: "customer" | "admin";
  deviceFp: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: number;
  expiresAt: number;
}

export async function getSessionByToken(
  token: string,
  db?: Client,
): Promise<SessionRow | null> {
  if (!isDbConfigured() && !db) return null;
  if (!token) return null;
  await ensureSchema(db);
  const client = db ?? getDb();
  const res = await client.execute({
    sql: "SELECT id, customer_id, token_hash, role, device_fp, ip, user_agent, created_at, expires_at FROM sessions WHERE token_hash = ?",
    args: [hashToken(token)],
  });
  if (res.rows.length === 0) return null;
  const r = res.rows[0];
  return {
    id: Number(r.id),
    customerId: Number(r.customer_id),
    tokenHash: r.token_hash as string,
    role: (r.role as "customer" | "admin") ?? "customer",
    deviceFp: (r.device_fp as string | null) ?? null,
    ip: (r.ip as string | null) ?? null,
    userAgent: (r.user_agent as string | null) ?? null,
    createdAt: Number(r.created_at),
    expiresAt: Number(r.expires_at),
  };
}

export async function listSessionsByCustomer(
  customerId: number,
  db?: Client,
): Promise<SessionRow[]> {
  if (!isDbConfigured() && !db) return [];
  await ensureSchema(db);
  const client = db ?? getDb();
  const res = await client.execute({
    sql: "SELECT id, customer_id, token_hash, role, device_fp, ip, user_agent, created_at, expires_at FROM sessions WHERE customer_id = ? AND expires_at > ? ORDER BY created_at DESC",
    args: [customerId, Date.now()],
  });
  return res.rows.map((r) => ({
    id: Number(r.id),
    customerId: Number(r.customer_id),
    tokenHash: r.token_hash as string,
    role: (r.role as "customer" | "admin") ?? "customer",
    deviceFp: (r.device_fp as string | null) ?? null,
    ip: (r.ip as string | null) ?? null,
    userAgent: (r.user_agent as string | null) ?? null,
    createdAt: Number(r.created_at),
    expiresAt: Number(r.expires_at),
  }));
}

export async function revokeAllSessions(
  customerId: number,
  db?: Client,
): Promise<void> {
  if (!isDbConfigured() && !db) return;
  await ensureSchema(db);
  const client = db ?? getDb();
  await client.execute({
    sql: "DELETE FROM sessions WHERE customer_id = ?",
    args: [customerId],
  });
}

export async function getSessionUser(token: string): Promise<SessionUser | null> {
  if (!isDbConfigured()) return null;
  if (!token) return null;
  await ensureSchema();
  const db = getDb();
  const row = await db.execute({
    sql: "SELECT s.id, s.customer_id, s.role, s.expires_at, c.user_id, c.name, c.status, c.expires_at AS license_expires FROM sessions s LEFT JOIN customers c ON c.id = s.customer_id WHERE s.token_hash = ?",
    args: [hashToken(token)],
  });
  if (row.rows.length === 0) return null;
  const r = row.rows[0];
  if (Number(r.expires_at) < Date.now()) return null;

  const role = r.role as string;
  if (role === "admin") {
    return { customerId: 0, userId: "admin", name: "Admin", role: "admin" };
  }

  // Customer roles must be active and not expired
  if (r.status !== "active") return null;
  const licExp = Number(r.license_expires);
  if (licExp && licExp < Date.now()) return null;

  return {
    customerId: Number(r.customer_id),
    userId: r.user_id as string,
    name: r.name as string,
    role: "customer",
  };
}

export async function deleteSession(token: string, db?: Client): Promise<void> {
  if (!isDbConfigured() && !db) return;
  await ensureSchema(db);
  const client = db ?? getDb();
  await client.execute({
    sql: "DELETE FROM sessions WHERE token_hash = ?",
    args: [hashToken(token)],
  });
}

// ---- Rate limiting (per bucket) ----

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const WINDOW_MS = 15 * 60 * 1000;

export async function checkRateLimit(bucket: string, db?: Client): Promise<number | null> {
  if (!isDbConfigured() && !db) return null;
  await ensureSchema(db);
  const client = db ?? getDb();
  const now = Date.now();
  const row = await client.execute({
    sql: "SELECT count, window_start, locked_until FROM login_attempts WHERE bucket = ?",
    args: [bucket],
  });
  if (row.rows.length === 0) {
    await client.execute({
      sql: "INSERT INTO login_attempts (bucket, count, window_start, locked_until) VALUES (?, 1, ?, NULL)",
      args: [bucket, now],
    });
    return null;
  }
  const r = row.rows[0];
  const lockedUntil = r.locked_until ? Number(r.locked_until) : null;
  if (lockedUntil && lockedUntil > now) {
    return lockedUntil - now;
  }
  const windowStart = Number(r.window_start);
  if (now - windowStart > WINDOW_MS) {
    // reset window
    await client.execute({
      sql: "UPDATE login_attempts SET count = 1, window_start = ?, locked_until = NULL WHERE bucket = ?",
      args: [now, bucket],
    });
    return null;
  }
  return null;
}

export async function recordFailedAttempt(bucket: string, db?: Client): Promise<{ locked: boolean; retryAfterMs: number | null }> {
  if (!isDbConfigured() && !db) return { locked: false, retryAfterMs: null };
  await ensureSchema(db);
  const client = db ?? getDb();
  const now = Date.now();
  const row = await client.execute({
    sql: "SELECT count, window_start, locked_until FROM login_attempts WHERE bucket = ?",
    args: [bucket],
  });
  if (row.rows.length === 0) {
    await client.execute({
      sql: "INSERT INTO login_attempts (bucket, count, window_start, locked_until) VALUES (?, 1, ?, NULL)",
      args: [bucket, now],
    });
    return { locked: false, retryAfterMs: null };
  }
  const r = row.rows[0];
  const count = Number(r.count) + 1;
  if (count >= MAX_ATTEMPTS) {
    const lockedUntil = now + LOCKOUT_MS;
    await client.execute({
      sql: "UPDATE login_attempts SET count = ?, locked_until = ? WHERE bucket = ?",
      args: [count, lockedUntil, bucket],
    });
    return { locked: true, retryAfterMs: LOCKOUT_MS };
  }
  await client.execute({
    sql: "UPDATE login_attempts SET count = ? WHERE bucket = ?",
    args: [count, bucket],
  });
  return { locked: false, retryAfterMs: null };
}

export async function clearRateLimit(bucket: string, db?: Client): Promise<void> {
  if (!isDbConfigured() && !db) return;
  await ensureSchema(db);
  const client = db ?? getDb();
  await client.execute({ sql: "DELETE FROM login_attempts WHERE bucket = ?", args: [bucket] });
}
