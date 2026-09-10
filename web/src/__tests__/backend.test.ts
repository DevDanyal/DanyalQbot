/**
 * Comprehensive test suite for the Danyal QBot backend foundation.
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { createClient, type Client } from "@libsql/client";

let db: Client;

beforeAll(async () => {
  // Create in-memory database.
  db = createClient({ url: ":memory:" });

  // Mock getDb to return our in-memory client.
  const dbMod = await import("@/lib/db");
  vi.spyOn(dbMod, "getDb").mockReturnValue(db);

  // Initialize schema on the in-memory db.
  await dbMod.initSchema(db);
});

beforeEach(async () => {
  // Clean all tables between tests for isolation.
  await db.batch([
    "DELETE FROM activity_logs",
    "DELETE FROM security_logs",
    "DELETE FROM devices",
    "DELETE FROM licenses",
    "DELETE FROM sessions",
    "DELETE FROM login_attempts",
    "DELETE FROM quotex_accounts",
    "DELETE FROM customers",
  ]);
  // Re-seed default plans since we cleared everything.
  const { seedDefaultPlans } = await import("@/lib/db");
  await seedDefaultPlans(db);
});

// ─── Imports ─────────────────────────────────────────────────
import {
  hashPassword,
  verifyPassword,
  createSession,
  getSessionByToken,
  deleteSession,
  revokeAllSessions,
  checkRateLimit,
  recordFailedAttempt,
  clearRateLimit,
  hashToken,
  newSessionToken,
} from "@/lib/db";
import {
  createCustomer,
  findCustomerByUserId,
  findCustomerById,
  listCustomers,
  updateCustomerStatus,
  extendCustomerExpiry,
  resetCustomerPassword,
} from "@/lib/customers";
import {
  listPlans,
  getPlanByCode,
  createPlan,
  createLicenseForCustomer,
  getLicenseForCustomer,
  extendLicense,
  setLicenseStatus,
  deriveLicenseStatus,
  toPublicLicense,
} from "@/lib/licensing";
import {
  hashDeviceKey,
  isValidDeviceKey,
  verifyDeviceAccess,
  revokeDevice,
  resetAllDevices,
  listDevicesByCustomer,
  countActiveDevices,
} from "@/lib/devices";
import { logSecurity, logActivity, listSecurityLogs, listActivityLogs } from "@/lib/audit";
import { loginFlow } from "@/lib/auth-service";
import { resolveAuthFromToken, requireAdminFromToken, ApiError } from "@/lib/api-auth";

// ─── 1. Password hashing ────────────────────────────────────
describe("Password hashing", () => {
  it("hashes and verifies a correct password", () => {
    const hash = hashPassword("testpass123");
    expect(hash).toContain(":");
    expect(verifyPassword("testpass123", hash)).toBe(true);
  });

  it("rejects a wrong password", () => {
    const hash = hashPassword("correct");
    expect(verifyPassword("wrong", hash)).toBe(false);
  });

  it("rejects a malformed hash", () => {
    expect(verifyPassword("any", "not-a-hash")).toBe(false);
    expect(verifyPassword("any", "")).toBe(false);
  });
});

// ─── 2. Sessions ────────────────────────────────────────────
describe("Sessions", () => {
  it("creates and retrieves a session by token", async () => {
    const token = await createSession(1, "customer", 60_000, {}, db);
    expect(token).toBeTruthy();
    const row = await getSessionByToken(token, db);
    expect(row).not.toBeNull();
    expect(row!.customerId).toBe(1);
    expect(row!.role).toBe("customer");
    expect(row!.expiresAt).toBeGreaterThan(Date.now());
  });

  it("creates an admin session", async () => {
    const token = await createSession(null, "admin", 60_000, {}, db);
    const row = await getSessionByToken(token, db);
    expect(row).not.toBeNull();
    expect(row!.role).toBe("admin");
  });

  it("deletes a session", async () => {
    const token = await createSession(1, "customer", 60_000, {}, db);
    await deleteSession(token, db);
    const row = await getSessionByToken(token, db);
    expect(row).toBeNull();
  });

  it("revokes all sessions for a customer", async () => {
    await createSession(1, "customer", 60_000, {}, db);
    await createSession(1, "customer", 60_000, {}, db);
    await revokeAllSessions(1, db);
    const res = await db.execute({
      sql: "SELECT COUNT(*) AS n FROM sessions WHERE customer_id = ?",
      args: [1],
    });
    expect(Number(res.rows[0].n)).toBe(0);
  });

  it("rejects a forged token", async () => {
    const row = await getSessionByToken("nonexistent-token", db);
    expect(row).toBeNull();
  });
});

// ─── 3. Rate limiting ───────────────────────────────────────
describe("Rate limiting", () => {
  it("allows the first attempt", async () => {
    const lock = await checkRateLimit("test-bucket", db);
    expect(lock).toBeNull();
  });

  it("locks after MAX_ATTEMPTS (5)", async () => {
    for (let i = 0; i < 4; i++) {
      await recordFailedAttempt("rl-test", db);
    }
    const r = await recordFailedAttempt("rl-test", db);
    expect(r.locked).toBe(true);
    expect(r.retryAfterMs).toBeGreaterThan(0);
  });

  it("clears the rate limit", async () => {
    await recordFailedAttempt("rl-clear", db);
    await recordFailedAttempt("rl-clear", db);
    await clearRateLimit("rl-clear", db);
    const lock = await checkRateLimit("rl-clear", db);
    expect(lock).toBeNull();
  });
});

// ─── 4. Customers ───────────────────────────────────────────
describe("Customers", () => {
  it("creates and finds a customer by userId", async () => {
    const c = await createCustomer({
      userId: "DQB-TEST-0001",
      name: "Test User",
      password: "pass123",
      expiresAt: null,
    });
    expect(c.userId).toBe("DQB-TEST-0001");

    const found = await findCustomerByUserId("DQB-TEST-0001");
    expect(found).not.toBeNull();
    expect(found!.name).toBe("Test User");
  });

  it("finds a customer by id", async () => {
    const c = await createCustomer({
      userId: "DQB-FIND-0001",
      name: "Find Me",
      password: "pass123",
      expiresAt: null,
    });
    const found = await findCustomerById(c.id);
    expect(found).not.toBeNull();
    expect(found!.user_id).toBe("DQB-FIND-0001");
  });

  it("updates customer status", async () => {
    const c = await createCustomer({
      userId: "DQB-SUSP-0001",
      name: "Suspend Me",
      password: "pass123",
      expiresAt: null,
    });
    await updateCustomerStatus(c.id, "suspended");
    const found = await findCustomerById(c.id);
    expect(found!.status).toBe("suspended");
  });

  it("extends customer expiry", async () => {
    const c = await createCustomer({
      userId: "DQB-EXT-0001",
      name: "Extend Me",
      password: "pass123",
      expiresAt: new Date(Date.now() + 10 * 86400000),
    });
    const updated = await extendCustomerExpiry(c.id, 5);
    expect(updated).not.toBeNull();
    expect(updated!.expires_at).toBeGreaterThan(Date.now() + 14 * 86400000);
  });

  it("resets customer password", async () => {
    const c = await createCustomer({
      userId: "DQB-RPW-0001",
      name: "Reset PW",
      password: "oldpass",
      expiresAt: null,
    });
    await resetCustomerPassword(c.id, "newpass123");
    const found = await findCustomerByUserId("DQB-RPW-0001");
    expect(verifyPassword("newpass123", found!.password_hash)).toBe(true);
    expect(verifyPassword("oldpass", found!.password_hash)).toBe(false);
  });

  it("lists all customers", async () => {
    await createCustomer({ userId: "DQB-LST-0001", name: "A", password: "pass", expiresAt: null });
    await createCustomer({ userId: "DQB-LST-0002", name: "B", password: "pass", expiresAt: null });
    const all = await listCustomers();
    expect(all.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── 5. Plans ───────────────────────────────────────────────
describe("Plans", () => {
  it("seeds default plans", async () => {
    const plans = await listPlans();
    expect(plans.length).toBeGreaterThanOrEqual(4);
    const free = plans.find((p) => p.code === "FREE");
    expect(free).toBeDefined();
    expect(free!.device_limit).toBe(1);
  });

  it("creates a custom plan", async () => {
    const plan = await createPlan({
      code: "CUSTOM",
      name: "Custom Plan",
      durationDays: 14,
      deviceLimit: 2,
      priceCents: 999,
    });
    expect(plan.code).toBe("CUSTOM");
    expect(plan.device_limit).toBe(2);
  });

  it("gets a plan by code", async () => {
    const plan = await getPlanByCode("PRO");
    expect(plan).not.toBeNull();
    expect(plan!.name).toBe("Pro");
  });

  it("returns null for unknown plan code", async () => {
    const plan = await getPlanByCode("NONEXISTENT");
    expect(plan).toBeNull();
  });
});

// ─── 6. Licenses ────────────────────────────────────────────
describe("Licenses", () => {
  let customerId: number;

  beforeEach(async () => {
    const c = await createCustomer({
      userId: "DQB-LIC-0001",
      name: "License User",
      password: "pass123",
      expiresAt: null,
    });
    customerId = c.id;
  });

  it("creates a license for a customer", async () => {
    const plan = await getPlanByCode("PRO");
    const lic = await createLicenseForCustomer({ customerId, plan: plan! });
    expect(lic.license_id).toMatch(/^LIC-/);
    expect(lic.status).toBe("active");
    expect(lic.expires_at).toBeGreaterThan(Date.now());
  });

  it("rejects duplicate license", async () => {
    const plan = await getPlanByCode("PRO");
    await createLicenseForCustomer({ customerId, plan: plan! });
    await expect(createLicenseForCustomer({ customerId, plan: plan! })).rejects.toThrow();
  });

  it("derives ACTIVE status", async () => {
    const plan = await getPlanByCode("PRO");
    const lic = await createLicenseForCustomer({ customerId, plan: plan! });
    expect(deriveLicenseStatus(lic)).toBe("ACTIVE");
  });

  it("derives EXPIRED status for past expiry", async () => {
    const plan = await getPlanByCode("PRO");
    const lic = await createLicenseForCustomer({ customerId, plan: plan!, expiresAt: Date.now() - 1000 });
    expect(deriveLicenseStatus(lic)).toBe("EXPIRED");
  });

  it("derives EXPIRING_SOON status", async () => {
    const plan = await getPlanByCode("PRO");
    const lic = await createLicenseForCustomer({ customerId, plan: plan!, expiresAt: Date.now() + 2 * 86400000 });
    expect(deriveLicenseStatus(lic)).toBe("EXPIRING_SOON");
  });

  it("derives SUSPENDED status", async () => {
    const plan = await getPlanByCode("PRO");
    const lic = await createLicenseForCustomer({ customerId, plan: plan! });
    await setLicenseStatus(lic.id, "suspended");
    const updated = await getLicenseForCustomer(customerId);
    expect(deriveLicenseStatus(updated!)).toBe("SUSPENDED");
  });

  it("extends a license", async () => {
    const plan = await getPlanByCode("PRO");
    const lic = await createLicenseForCustomer({ customerId, plan: plan! });
    const original = lic.expires_at!;
    const extended = await extendLicense(lic.id, 30);
    expect(extended!.expires_at).toBe(original + 30 * 86400000);
  });

  it("toPublicLicense strips sensitive fields", async () => {
    const plan = await getPlanByCode("PRO");
    const lic = await createLicenseForCustomer({ customerId, plan: plan! });
    const pub = toPublicLicense(lic);
    expect(pub.licenseId).toBeTruthy();
    expect(pub.status).toBeTruthy();
    expect(pub.plan?.code).toBe("PRO");
    expect("customer_id" in pub).toBe(false);
  });
});

// ─── 7. Device binding ──────────────────────────────────────
describe("Device binding", () => {
  let customerId: number;
  let deviceLimit: number;

  beforeEach(async () => {
    const c = await createCustomer({
      userId: "DQB-DEV-0001",
      name: "Device User",
      password: "pass123",
      expiresAt: null,
    });
    customerId = c.id;
    const plan = await getPlanByCode("PRO");
    const lic = await createLicenseForCustomer({ customerId, plan: plan! });
    deviceLimit = lic.device_limit;
  });

  it("validates device key format", () => {
    expect(isValidDeviceKey("a".repeat(24))).toBe(true);
    expect(isValidDeviceKey("short")).toBe(false);
    expect(isValidDeviceKey("")).toBe(false);
    expect(isValidDeviceKey(null)).toBe(false);
  });

  it("registers a new device on first login", async () => {
    const key = "device-key-1234567890abcdefghij";
    const v = await verifyDeviceAccess(customerId, key, { device_limit: deviceLimit }, { ip: "1.2.3.4", platform: "android" });
    expect(v.allowed).toBe(true);
    expect(v.device).not.toBeNull();
  });

  it("allows the same device on second login", async () => {
    const key = "device-key-1234567890abcdefghij";
    await verifyDeviceAccess(customerId, key, { device_limit: deviceLimit }, {});
    const v = await verifyDeviceAccess(customerId, key, { device_limit: deviceLimit }, {});
    expect(v.allowed).toBe(true);
  });

  it("blocks a second device when limit is 1", async () => {
    const key1 = "device-key-11111111111111111111111";
    const key2 = "device-key-22222222222222222222222";
    await verifyDeviceAccess(customerId, key1, { device_limit: 1 }, {});
    const v = await verifyDeviceAccess(customerId, key2, { device_limit: 1 }, {});
    expect(v.allowed).toBe(false);
    if (!v.allowed) expect(v.reason).toBe("DEVICE_LIMIT_REACHED");
  });

  it("revokes a device", async () => {
    const key = "device-key-1234567890abcdefghij";
    const v = await verifyDeviceAccess(customerId, key, { device_limit: deviceLimit }, {});
    expect(v.allowed).toBe(true);
    if (!v.allowed || !v.device) throw new Error("Device not registered");
    const revoked = await revokeDevice(v.device.id, customerId);
    expect(revoked).not.toBeNull();
    expect(revoked!.is_active).toBe(false);
  });

  it("resets all devices for a customer", async () => {
    const key = "device-key-11111111111111111111111";
    await verifyDeviceAccess(customerId, key, { device_limit: deviceLimit }, {});
    const n = await resetAllDevices(customerId);
    expect(n).toBe(1);
    const devices = await listDevicesByCustomer(customerId);
    expect(devices.every((d) => !d.is_active)).toBe(true);
  });

  it("counts active devices", async () => {
    const key = "device-key-11111111111111111111111";
    await verifyDeviceAccess(customerId, key, { device_limit: deviceLimit }, {});
    const count = await countActiveDevices(customerId);
    expect(count).toBe(1);
  });

  it("returns DEVICE_DISABLED for revoked device", async () => {
    const key = "device-key-1234567890abcdefghij";
    const v = await verifyDeviceAccess(customerId, key, { device_limit: deviceLimit }, {});
    expect(v.allowed).toBe(true);
    if (!v.allowed || !v.device) throw new Error("Device not registered");
    await revokeDevice(v.device.id, customerId);
    const verdict = await verifyDeviceAccess(customerId, key, { device_limit: deviceLimit }, {});
    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) expect(verdict.reason).toBe("DEVICE_DISABLED");
  });
});

// ─── 8. Audit logging ───────────────────────────────────────
describe("Audit logging", () => {
  it("logs a security event and retrieves it", async () => {
    await logSecurity("test.action", "Test detail", { ip: "1.1.1.1" });
    const logs = await listSecurityLogs({ limit: 10 });
    expect(logs.length).toBe(1);
    expect(logs[0].action).toBe("test.action");
    expect(logs[0].ip).toBe("1.1.1.1");
  });

  it("logs an activity event with valid customer", async () => {
    const c = await createCustomer({ userId: "DQB-AUD-0001", name: "Audit User", password: "pass", expiresAt: null });
    await logActivity(c.id, "test.activity", "Activity detail", {});
    const logs = await listActivityLogs({ limit: 10 });
    expect(logs.length).toBe(1);
    expect(logs[0].action).toBe("test.activity");
  });

  it("filters security logs by actorId", async () => {
    await logSecurity("a", "d1", { actorId: 1 });
    await logSecurity("b", "d2", { actorId: 2 });
    const logs = await listSecurityLogs({ actorId: 1 });
    expect(logs.length).toBe(1);
    expect(logs[0].action).toBe("a");
  });

  it("filters activity logs by customerId", async () => {
    const c1 = await createCustomer({ userId: "DQB-AUD-0010", name: "A", password: "pass", expiresAt: null });
    const c2 = await createCustomer({ userId: "DQB-AUD-0011", name: "B", password: "pass", expiresAt: null });
    await logActivity(c1.id, "a", "d1", {});
    await logActivity(c2.id, "b", "d2", {});
    const logs = await listActivityLogs({ customerId: c1.id });
    expect(logs.length).toBe(1);
    expect(logs[0].action).toBe("a");
  });
});

// ─── 9. Login flow ──────────────────────────────────────────
describe("Login flow", () => {
  beforeEach(async () => {
    const c = await createCustomer({
      userId: "DQB-LOGIN-0001",
      name: "Login User",
      password: "testpass",
      expiresAt: null,
    });
    const plan = await getPlanByCode("PRO");
    await createLicenseForCustomer({ customerId: c.id, plan: plan! });
  });

  it("succeeds with valid credentials and device", async () => {
    const result = await loginFlow(
      { userId: "DQB-LOGIN-0001", password: "testpass", deviceKey: "device-key-AAAAAAAAAAAAAAAAAAAAAAAB" },
      { ip: "1.2.3.4" },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.token).toBeTruthy();
      expect(result.user.userId).toBe("DQB-LOGIN-0001");
      expect(result.license).not.toBeNull();
    }
  });

  it("fails with wrong password", async () => {
    const result = await loginFlow(
      { userId: "DQB-LOGIN-0001", password: "wrongpass", deviceKey: "device-key-BBBBBBBBBBBBBBBBBBBBBBBBBC" },
      { ip: "1.2.3.4" },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("INVALID_CREDENTIALS");
  });

  it("fails with nonexistent user", async () => {
    const result = await loginFlow(
      { userId: "DQB-NOPE-0000", password: "pass", deviceKey: "device-key-CCCCCCCCCCCCCCCCCCCCCCCCCCDD" },
      { ip: "1.2.3.4" },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("INVALID_CREDENTIALS");
  });

  it("fails with invalid device key format", async () => {
    const result = await loginFlow(
      { userId: "DQB-LOGIN-0001", password: "testpass", deviceKey: "short" },
      { ip: "1.2.3.4" },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("INVALID_DEVICE_KEY");
  });

  it("fails for suspended license", async () => {
    const c = await findCustomerByUserId("DQB-LOGIN-0001");
    const lic = await getLicenseForCustomer(c!.id);
    // Only suspend the license, don't touch customer status (setLicenseStatus
    // also revokes the customer row, so test the raw license path instead).
    await db.execute({ sql: "UPDATE licenses SET status = 'suspended' WHERE id = ?", args: [lic!.id] });

    const result = await loginFlow(
      { userId: "DQB-LOGIN-0001", password: "testpass", deviceKey: "device-key-DDDDDDDDDDDDDDDDDDDDDDDDDEE" },
      { ip: "1.2.3.4" },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("LICENSE_SUSPENDED");
  });

  it("fails for expired license", async () => {
    const c = await findCustomerByUserId("DQB-LOGIN-0001");
    const lic = await getLicenseForCustomer(c!.id);
    await db.execute({
      sql: "UPDATE licenses SET expires_at = ? WHERE id = ?",
      args: [Date.now() - 1000, lic!.id],
    });

    const result = await loginFlow(
      { userId: "DQB-LOGIN-0001", password: "testpass", deviceKey: "device-key-EEEEEEEEEEEEEEEEEEEEEEEEFF" },
      { ip: "1.2.3.4" },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("LICENSE_EXPIRED");
  });

  it("blocks unauthorized second device when limit is 1", async () => {
    const key1 = "device-key-FFFFFFFFFFFFFFFFFFFFFFFFFF00";
    const key2 = "device-key-GGGGGGGGGGGGGGGGGGGGGGGGGGG01";

    const r1 = await loginFlow({ userId: "DQB-LOGIN-0001", password: "testpass", deviceKey: key1 }, { ip: "1.2.3.4" });
    expect(r1.ok).toBe(true);

    const r2 = await loginFlow({ userId: "DQB-LOGIN-0001", password: "testpass", deviceKey: key2 }, { ip: "1.2.3.4" });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.code).toBe("DEVICE_UNAUTHORIZED");
  });

  it("fails with missing input", async () => {
    const result = await loginFlow({}, {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("INVALID_INPUT");
  });
});

// ─── 10. Token resolution / authorization ───────────────────
describe("Token resolution & authorization", () => {
  let customerId: number;

  beforeEach(async () => {
    const c = await createCustomer({
      userId: "DQB-AUTH-0001",
      name: "Auth User",
      password: "testpass",
      expiresAt: null,
    });
    customerId = c.id;
    const plan = await getPlanByCode("PRO");
    await createLicenseForCustomer({ customerId, plan: plan! });
  });

  it("resolves a valid customer token", async () => {
    const token = await createSession(customerId, "customer", 60_000, {}, db);
    const ctx = await resolveAuthFromToken(token, db);
    expect(ctx.kind).toBe("customer");
    expect(ctx.customer?.userId).toBe("DQB-AUTH-0001");
    expect(ctx.license).not.toBeNull();
  });

  it("resolves a valid admin token", async () => {
    const token = await createSession(null, "admin", 60_000, {}, db);
    const ctx = await resolveAuthFromToken(token, db);
    expect(ctx.kind).toBe("admin");
  });

  it("rejects an expired token", async () => {
    const token = await createSession(customerId, "customer", -1, {}, db);
    await expect(resolveAuthFromToken(token, db)).rejects.toThrow(ApiError);
  });

  it("rejects a nonexistent token", async () => {
    await expect(resolveAuthFromToken("fake-token", db)).rejects.toThrow(ApiError);
  });

  it("requireAdminFromToken rejects customer tokens", async () => {
    const token = await createSession(customerId, "customer", 60_000, {}, db);
    await expect(requireAdminFromToken(token, db)).rejects.toThrow(ApiError);
  });

  it("requireAdminFromToken accepts admin tokens", async () => {
    const token = await createSession(null, "admin", 60_000, {}, db);
    const ctx = await requireAdminFromToken(token, db);
    expect(ctx.kind).toBe("admin");
  });
});

// ─── 11. Device hash consistency ────────────────────────────
describe("Device key hashing", () => {
  it("produces consistent hashes", () => {
    const key = "my-secure-device-key-1234567890";
    expect(hashDeviceKey(key)).toBe(hashDeviceKey(key));
  });

  it("produces different hashes for different keys", () => {
    expect(hashDeviceKey("key-a")).not.toBe(hashDeviceKey("key-b"));
  });
});

// ─── 12. Token generation ───────────────────────────────────
describe("Token generation", () => {
  it("generates unique tokens", () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 100; i++) tokens.add(newSessionToken());
    expect(tokens.size).toBe(100);
  });

  it("hashes are deterministic", () => {
    const token = newSessionToken();
    expect(hashToken(token)).toBe(hashToken(token));
  });
});
