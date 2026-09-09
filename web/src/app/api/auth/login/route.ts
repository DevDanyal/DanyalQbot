import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  createSession,
  verifyPassword,
  isDbConfigured,
  recordFailedAttempt,
  checkRateLimit,
  clearRateLimit,
  initSchema,
} from "@/lib/db";
import {
  findCustomerByUserId,
  bindDevice,
  recordLogin,
} from "@/lib/customers";
import {
  AUTH_COOKIE,
  SESSION_TTL_MS,
  deviceFingerprint,
  getClientIp,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json(
      { ok: false, message: "Licensing is not configured on the server." },
      { status: 503 },
    );
  }

  await initSchema();

  let body: { userId?: string; password?: string; deviceId?: string } = {};
  try {
    body = await request.json();
  } catch {
    /* ignore */
  }

  const userId = (body.userId ?? "").trim().toUpperCase();
  const password = body.password ?? "";
  const deviceId = body.deviceId ?? deviceFingerprint(request.headers);

  if (!userId || !password) {
    return NextResponse.json(
      { ok: false, message: "User ID and password are required." },
      { status: 400 },
    );
  }

  const ip = getClientIp(request.headers);
  const bucket = `login:${ip ?? "unknown"}:${userId}`;

  const lock = await checkRateLimit(bucket);
  if (lock) {
    return NextResponse.json(
      {
        ok: false,
        message: `Too many failed attempts. Try again in ${Math.ceil(lock / 60000)} minutes.`,
      },
      { status: 429 },
    );
  }

  const customer = await findCustomerByUserId(userId);
  if (!customer || !verifyPassword(password, customer.password_hash)) {
    const r = await recordFailedAttempt(bucket);
    const msg = r.locked
      ? `Too many failed attempts. Try again in 15 minutes.`
      : "Invalid User ID or password.";
    return NextResponse.json({ ok: false, message: msg }, { status: 401 });
  }

  if (customer.status !== "active") {
    return NextResponse.json(
      { ok: false, message: `This license is ${customer.status}. Contact the administrator.` },
      { status: 403 },
    );
  }

  if (customer.expires_at && customer.expires_at < Date.now()) {
    return NextResponse.json(
      { ok: false, message: "Your license has expired. Contact the administrator to renew." },
      { status: 403 },
    );
  }

  // Device binding: allow device to bind on first login from a new device,
  // but block a license that is already bound to a different device.
  if (customer.device_id && customer.device_id !== deviceId) {
    return NextResponse.json(
      { ok: false, message: "This license is already bound to another device." },
      { status: 403 },
    );
  }

  const token = await createSession(customer.id, "customer", SESSION_TTL_MS);

  if (!customer.device_id) {
    await bindDevice(customer.id, deviceId);
  }
  await recordLogin(customer.id, ip);
  await clearRateLimit(bucket);

  const store = await cookies();
  store.set(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });

  return NextResponse.json({
    ok: true,
    user: { name: customer.name, userId: customer.user_id },
  });
}
