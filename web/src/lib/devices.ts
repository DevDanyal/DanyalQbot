import { createHash } from "crypto";
import type { Client } from "@libsql/client";
import { getDb, isDbConfigured, ensureSchema } from "./db";
import type { License } from "./licensing";

/**
 * Device binding service.
 *
 * The client supplies a high-entropy persistent device key on every login.
 * Only the SHA-256 *hash* of that key is stored, so a database leak does not
 * expose the raw secret, and the key cannot be guessed by format alone.
 */

export const DEVICE_KEY_RE = /^[A-Za-z0-9_-]{24,64}$/;

export function hashDeviceKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function isValidDeviceKey(key: unknown): key is string {
  return typeof key === "string" && DEVICE_KEY_RE.test(key);
}

export interface Device {
  id: number;
  customer_id: number;
  license_id: number | null;
  device_key_hash: string;
  label: string | null;
  platform: string | null;
  is_active: boolean;
  first_seen_at: number;
  last_seen_at: number;
  last_ip: string | null;
  created_at: number;
  updated_at: number;
}

export type DeviceVerdict =
  | { allowed: true; device: Device }
  | { allowed: false; reason: "DEVICE_DISABLED" | "DEVICE_LIMIT_REACHED"; device: Device | null };

function rowToDevice(r: Record<string, unknown>): Device {
  return {
    id: Number(r.id),
    customer_id: Number(r.customer_id),
    license_id: r.license_id == null ? null : Number(r.license_id),
    device_key_hash: r.device_key_hash as string,
    label: (r.label as string | null) ?? null,
    platform: (r.platform as string | null) ?? null,
    is_active: Number(r.is_active) === 1,
    first_seen_at: Number(r.first_seen_at),
    last_seen_at: Number(r.last_seen_at),
    last_ip: (r.last_ip as string | null) ?? null,
    created_at: Number(r.created_at),
    updated_at: Number(r.updated_at),
  };
}

async function findDevice(
  client: Client,
  where: string,
  args: (string | number)[],
): Promise<Device | null> {
  const res = await client.execute({
    sql: `SELECT * FROM devices WHERE ${where} LIMIT 1`,
    args,
  });
  if (res.rows.length === 0) return null;
  return rowToDevice(res.rows[0]);
}

export async function listDevicesByCustomer(customerId: number, db?: Client): Promise<Device[]> {
  if (!isDbConfigured() && !db) return [];
  await ensureSchema(db);
  const client = db ?? getDb();
  const res = await client.execute({
    sql: "SELECT * FROM devices WHERE customer_id = ? ORDER BY created_at ASC",
    args: [customerId],
  });
  return res.rows.map((r) => rowToDevice(r));
}

export async function countActiveDevices(customerId: number, db?: Client): Promise<number> {
  if (!isDbConfigured() && !db) return 0;
  await ensureSchema(db);
  const client = db ?? getDb();
  const res = await client.execute({
    sql: "SELECT COUNT(*) AS n FROM devices WHERE customer_id = ? AND is_active = 1",
    args: [customerId],
  });
  return Number(res.rows[0]?.n ?? 0);
}

/**
 * The gatekeeper for the LOGIN → device check step.
 *
 * - A known, active device is allowed (and refreshed).
 * - A disabled device is rejected.
 * - An unknown device registers if the license still has free slots,
 *   otherwise the login is rejected.
 */
export async function verifyDeviceAccess(
  customerId: number,
  deviceKey: string,
  license: Pick<License, "device_limit">,
  meta: { ip?: string | null; platform?: string | null; label?: string | null } = {},
  db?: Client,
): Promise<DeviceVerdict> {
  if (!isDbConfigured() && !db) return { allowed: false, reason: "DEVICE_DISABLED", device: null };
  await ensureSchema(db);
  const client = db ?? getDb();
  const hash = hashDeviceKey(deviceKey);
  const now = Date.now();

  const existing = await findDevice(client, "customer_id = ? AND device_key_hash = ?", [customerId, hash]);
  if (existing) {
    if (!existing.is_active) return { allowed: false, reason: "DEVICE_DISABLED", device: existing };
    await client.execute({
      sql: "UPDATE devices SET last_seen_at = ?, last_ip = ?, updated_at = ? WHERE id = ?",
      args: [now, meta.ip ?? null, now, existing.id],
    });
    return { allowed: true, device: existing };
  }

  const activeCount = await countActiveDevices(customerId, db);
  if (activeCount >= license.device_limit) {
    return { allowed: false, reason: "DEVICE_LIMIT_REACHED", device: null };
  }

  const res = await client.execute({
    sql: "INSERT INTO devices (customer_id, license_id, device_key_hash, label, platform, is_active, first_seen_at, last_seen_at, last_ip, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)",
    args: [
      customerId,
      license && "id" in license ? (license as License).id : null,
      hash,
      meta.label ?? null,
      meta.platform ?? null,
      now,
      now,
      meta.ip ?? null,
      now,
      now,
    ],
  });
  const device = await findDevice(client, "id = ?", [Number(res.lastInsertRowid)]);
  if (!device) return { allowed: false, reason: "DEVICE_DISABLED", device: null };

  // Legacy mirror so the admin page keeps working.
  await client.execute({
    sql: "UPDATE customers SET device_id = ? WHERE id = ?",
    args: [`DEV-${hash.slice(0, 8).toUpperCase()}`, customerId],
  });

  return { allowed: true, device };
}

export async function revokeDevice(deviceId: number, customerId?: number, db?: Client): Promise<Device | null> {
  if (!isDbConfigured() && !db) return null;
  await ensureSchema(db);
  const client = db ?? getDb();
  const where = customerId ? "id = ? AND customer_id = ?" : "id = ?";
  const args: (string | number)[] = customerId ? [deviceId, customerId] : [deviceId];
  const device = await findDevice(client, where, args);
  if (!device) return null;
  await client.batch([
    { sql: "UPDATE devices SET is_active = 0, updated_at = ? WHERE id = ?", args: [Date.now(), device.id] },
    { sql: "DELETE FROM sessions WHERE customer_id = ? AND (device_fp IS NULL OR device_fp = ?)", args: [device.customer_id, device.device_key_hash] },
  ]);
  // Clear the legacy mirror if it pointed at this device.
  const mirror = await client.execute({
    sql: "SELECT device_id FROM customers WHERE id = ?",
    args: [device.customer_id],
  });
  const cur = mirror.rows[0]?.device_id as string | null;
  if (cur && cur === `DEV-${device.device_key_hash.slice(0, 8).toUpperCase()}`) {
    await client.execute({ sql: "UPDATE customers SET device_id = NULL WHERE id = ?", args: [device.customer_id] });
  }
  return { ...device, is_active: false };
}

export async function resetAllDevices(customerId: number, db?: Client): Promise<number> {
  if (!isDbConfigured() && !db) return 0;
  await ensureSchema(db);
  const client = db ?? getDb();
  const now = Date.now();
  const res = await client.execute({
    sql: "UPDATE devices SET is_active = 0, updated_at = ? WHERE customer_id = ?",
    args: [now, customerId],
  });
  await client.execute({ sql: "UPDATE customers SET device_id = NULL WHERE id = ?", args: [customerId] });
  return Number(res.rowsAffected);
}

export async function touchDevice(deviceId: number, ip: string | null, db?: Client): Promise<void> {
  if (!isDbConfigured() && !db) return;
  await ensureSchema(db);
  const client = db ?? getDb();
  await client.execute({
    sql: "UPDATE devices SET last_seen_at = ?, last_ip = ?, updated_at = ? WHERE id = ?",
    args: [Date.now(), ip, Date.now(), deviceId],
  });
}

export interface DeviceWithUser extends Device {
  user_id: string | null;
}

export async function listAllDevices(db?: Client): Promise<DeviceWithUser[]> {
  if (!isDbConfigured() && !db) return [];
  await ensureSchema(db);
  const client = db ?? getDb();
  const res = await client.execute({
    sql: "SELECT d.*, c.user_id FROM devices d LEFT JOIN customers c ON c.id = d.customer_id ORDER BY d.created_at DESC LIMIT 300",
  });
  return res.rows.map((r) => ({ ...rowToDevice(r), user_id: (r.user_id as string | null) ?? null }));
}

export async function setDeviceActive(deviceId: number, active: boolean, db?: Client): Promise<Device | null> {
  if (!isDbConfigured() && !db) return null;
  await ensureSchema(db);
  const client = db ?? getDb();
  const device = await findDevice(client, "id = ?", [deviceId]);
  if (!device) return null;
  await client.execute({
    sql: "UPDATE devices SET is_active = ?, updated_at = ? WHERE id = ?",
    args: [active ? 1 : 0, Date.now(), deviceId],
  });
  return { ...device, is_active: active };
}