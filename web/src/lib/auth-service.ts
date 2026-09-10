import type { Client } from "@libsql/client";
import {
  isDbConfigured,
  ensureSchema,
  createSession,
  checkRateLimit,
  recordFailedAttempt,
  clearRateLimit,
  deleteSession,
  revokeAllSessions,
  getSessionByToken,
  type SessionRow,
} from "./db";
import { findCustomerByUserId, recordLogin } from "./customers";
import {
  getLicenseForCustomer,
  toPublicLicense,
  deriveLicenseStatus,
  type PublicLicense,
} from "./licensing";
import {
  isValidDeviceKey,
  hashDeviceKey,
  verifyDeviceAccess,
} from "./devices";
import { logSecurity, logActivity } from "./audit";

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface LoginInput {
  userId?: string;
  password?: string;
  deviceKey?: string;
  platform?: string;
  label?: string;
}

export interface LoginMeta {
  ip?: string | null;
  userAgent?: string | null;
}

export type LoginResult =
  | {
      ok: true;
      token: string;
      user: { name: string; userId: string };
      license: PublicLicense | null;
      device: { deviceId: number; registered: boolean };
    }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      retryAfterMs?: number;
    };

/**
 * Full login pipeline — the single server-side gate for customer logins.
 *
 *   authenticate → account status → license/expiry → device binding → session
 *
 * Returns a stable machine-readable `code` so the mobile app and web ui can
 * render dedicated screens (e.g. "license expired").
 */
export async function loginFlow(
  input: LoginInput,
  meta: LoginMeta = {},
  db?: Client,
): Promise<LoginResult> {
  if (!isDbConfigured() && !db) {
    return fail(503, "SERVICE_UNAVAILABLE", "Authentication service is not configured.");
  }
  await ensureSchema(db);

  const userId = (input.userId ?? "").trim().toUpperCase();
  const password = input.password ?? "";
  const deviceKey = input.deviceKey ?? "";

  if (!userId || !password) {
    return fail(400, "INVALID_INPUT", "User ID and password are required.");
  }
  if (!isValidDeviceKey(deviceKey)) {
    return fail(400, "INVALID_DEVICE_KEY", "A valid device key is required to sign in.");
  }

  const bucket = `v1login:${meta.ip ?? "unknown"}:${userId}`;
  const lock = await checkRateLimit(bucket, db);
  if (lock) {
    await logSecurity("login.rate_limited", `Rate limited for ${userId}`, { ip: meta.ip, deviceFp: hashDeviceKey(deviceKey) }, db);
    return fail(
      429,
      "RATE_LIMITED",
      `Too many failed attempts. Try again in ${Math.ceil(lock / 60000)} minutes.`,
      Math.ceil(lock / 1000),
    );
  }

  const customer = await findCustomerByUserId(userId, db);
  if (!customer || !(await verifyCustomerPassword(customer.password_hash, password))) {
    const r = await recordFailedAttempt(bucket, db);
    await logSecurity(
      "login.failed",
      `Invalid credentials for ${userId}`,
      { actorId: customer?.id, ip: meta.ip, deviceFp: hashDeviceKey(deviceKey) },
      db,
    );
    const msg = r.locked
      ? "Too many failed attempts. Try again in 15 minutes."
      : "Invalid User ID or password.";
    return fail(401, "INVALID_CREDENTIALS", msg, r.locked ? 15 * 60 : undefined);
  }

  if (customer.status !== "active") {
    await logSecurity("login.blocked", `Account ${userId} is ${customer.status}`, { actorId: customer.id, ip: meta.ip, deviceFp: hashDeviceKey(deviceKey) }, db);
    return fail(403, "ACCOUNT_DISABLED", "This account is disabled. Contact the administrator.");
  }

  const lic = await getLicenseForCustomer(customer.id, db);
  if (!lic) {
    await logSecurity("login.blocked", `No license for ${userId}`, { actorId: customer.id, ip: meta.ip, deviceFp: hashDeviceKey(deviceKey) }, db);
    return fail(403, "LICENSE_MISSING", "No license is attached to this account.");
  }

  const status = deriveLicenseStatus(lic);
  if (status === "SUSPENDED") {
    await logSecurity("login.blocked", `License ${lic.license_id} suspended`, { actorId: customer.id, ip: meta.ip, deviceFp: hashDeviceKey(deviceKey) }, db);
    return fail(403, "LICENSE_SUSPENDED", "This license is suspended. Contact the administrator.");
  }
  if (status === "EXPIRED") {
    await logSecurity("login.blocked", `License ${lic.license_id} expired`, { actorId: customer.id, ip: meta.ip, deviceFp: hashDeviceKey(deviceKey) }, db);
    return fail(403, "LICENSE_EXPIRED", "Your license has expired. Contact the administrator to renew.");
  }

  // Device binding.
  const verdict = await verifyDeviceAccess(
    customer.id,
    deviceKey,
    lic,
    { ip: meta.ip, platform: input.platform, label: input.label },
    db,
  );
  if (!verdict.allowed) {
    const reason = verdict.reason === "DEVICE_LIMIT_REACHED"
      ? "This license has reached its device limit. Contact the administrator to reset a device."
      : "This device has been disabled for this license.";
    await logSecurity(
      "login.device_rejected",
      `${verdict.reason} for ${userId}`,
      { actorId: customer.id, ip: meta.ip, deviceFp: hashDeviceKey(deviceKey) },
      db,
    );
    return fail(403, "DEVICE_UNAUTHORIZED", reason);
  }

  const token = await createSession(
    customer.id,
    "customer",
    SESSION_TTL_MS,
    { deviceFp: verdict.device.device_key_hash, ip: meta.ip ?? undefined, userAgent: meta.userAgent ?? undefined },
    db,
  );

  const registered = Date.now() - verdict.device.first_seen_at < 5000;
  if (registered) {
    await logSecurity("device.registered", `New device bound for ${userId}`, { actorId: customer.id, ip: meta.ip, deviceFp: verdict.device.device_key_hash }, db);
  }
  await logActivity(customer.id, "login", `Signed in from ${meta.ip ?? "unknown IP"}`, { platform: input.platform }, db);
  await recordLogin(customer.id, meta.ip ?? null, db);
  await clearRateLimit(bucket, db);

  return {
    ok: true,
    token,
    user: { name: customer.name, userId: customer.user_id },
    license: toPublicLicense(lic),
    device: { deviceId: verdict.device.id, registered },
  };
}

async function verifyCustomerPassword(password_hash: string, password: string): Promise<boolean> {
  // Deferred import to keep db.ts concerns localized.
  const { verifyPassword } = await import("./db");
  return verifyPassword(password, password_hash);
}

function fail(
  status: number,
  code: string,
  message: string,
  retryAfterMs?: number,
): LoginResult {
  return retryAfterMs
    ? ({ ok: false, status, code, message, retryAfterMs } as const)
    : ({ ok: false, status, code, message } as const);
}

export async function createApiSession(
  customerId: number,
  meta: LoginMeta = {},
  db?: Client,
): Promise<string> {
  await ensureSchema(db);
  return createSession(customerId, "customer", SESSION_TTL_MS, {
    ip: meta.ip ?? undefined,
    userAgent: meta.userAgent ?? undefined,
  }, db);
}

export async function endSession(token: string, db?: Client): Promise<void> {
  await deleteSession(token, db);
}

export async function endAllSessions(customerId: number, db?: Client): Promise<void> {
  await revokeAllSessions(customerId, db);
}

export async function getTokenRow(token: string, db?: Client): Promise<SessionRow | null> {
  return getSessionByToken(token, db);
}