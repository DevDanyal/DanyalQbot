import { NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import { createSession, isDbConfigured, checkRateLimit, recordFailedAttempt, clearRateLimit } from "@/lib/db";
import { getClientIp } from "@/lib/auth";
import { logSecurity } from "@/lib/audit";
import { apiOk, apiFail } from "@/lib/api-v1";
import { ApiError } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminPassword) {
      throw new ApiError(503, "SERVICE_UNAVAILABLE", "Admin is not configured on the server.");
    }
    if (!isDbConfigured()) {
      throw new ApiError(503, "SERVICE_UNAVAILABLE", "Licensing is not configured on the server.");
    }

    let body: { password?: string } = {};
    try {
      body = await request.json();
    } catch {
      /* default */
    }

    const provided = body.password ?? "";
    const ip = getClientIp(request.headers);
    const bucket = `v1admin:${ip ?? "unknown"}`;

    const lock = await checkRateLimit(bucket);
    if (lock) {
      await logSecurity("admin.login.rate_limited", "Admin login rate limited", {
        actorType: "admin",
        actorRole: "admin",
        ip,
      });
      throw new ApiError(429, "RATE_LIMITED", `Too many failed attempts. Try again in ${Math.ceil(lock / 60000)} minutes.`);
    }

    const given = Buffer.from(provided);
    const expected = Buffer.from(adminPassword);
    const ok = given.length === expected.length && timingSafeEqual(given, expected);

    if (!ok) {
      const r = await recordFailedAttempt(bucket);
      await logSecurity("admin.login.failed", "Invalid admin password", {
        actorType: "admin",
        actorRole: "admin",
        ip,
      });
      const msg = r.locked
        ? "Too many failed attempts. Try again in 15 minutes."
        : "Invalid admin password.";
      throw new ApiError(401, "INVALID_CREDENTIALS", msg);
    }

    await clearRateLimit(bucket);

    const token = await createSession(null, "admin", 12 * 60 * 60 * 1000, { ip: ip ?? undefined });
    await logSecurity("admin.login.success", "Admin signed in", {
      actorType: "admin",
      actorRole: "admin",
      ip,
    });

    return apiOk({ token });
  } catch (err) {
    return apiFail(err);
  }
}
