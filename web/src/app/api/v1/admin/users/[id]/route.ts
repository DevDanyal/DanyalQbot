import { NextRequest } from "next/server";
import { getTokenFromRequest, requireAdminFromToken, ApiError } from "@/lib/api-auth";
import { apiOk, apiFail } from "@/lib/api-v1";
import { resetAllDevices, listDevicesByCustomer } from "@/lib/devices";
import { resetCustomerPassword, findCustomerById } from "@/lib/customers";
import { revokeAllSessions, isDbConfigured } from "@/lib/db";
import { logSecurity } from "@/lib/audit";
import { getLicenseForCustomer, setLicenseStatus as setLicStatus, toPublicLicense, deriveLicenseStatus } from "@/lib/licensing";
import { listSessionsByCustomer } from "@/lib/db";
import { listSecurityLogs, listActivityLogs } from "@/lib/audit";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const token = getTokenFromRequest(request);
    await requireAdminFromToken(token ?? "");
    if (!isDbConfigured()) throw new ApiError(503, "SERVICE_UNAVAILABLE", "Licensing is not configured.");

    const { id } = await params;
    const customerId = Number(id);
    if (!Number.isFinite(customerId)) throw new ApiError(400, "INVALID_INPUT", "Invalid user id.");

    const customer = await findCustomerById(customerId);
    if (!customer) throw new ApiError(404, "NOT_FOUND", "User not found.");

    const lic = await getLicenseForCustomer(customerId);
    const devices = await listDevicesByCustomer(customerId);
    const sessions = await listSessionsByCustomer(customerId);
    const securityLogs = await listSecurityLogs({ limit: 50, actorId: customerId });
    const activityLogs = await listActivityLogs({ limit: 50, customerId });

    return apiOk({
      user: {
        id: customer.id,
        userId: customer.user_id,
        name: customer.name,
        status: customer.status,
        createdAt: customer.created_at,
        lastLogin: customer.last_login,
        lastIp: customer.last_ip,
      },
      license: lic ? { ...toPublicLicense(lic), rawStatus: deriveLicenseStatus(lic) } : null,
      devices: devices.map((d) => ({
        id: d.id,
        label: d.label,
        platform: d.platform,
        isActive: d.is_active,
        firstSeenAt: d.first_seen_at,
        lastSeenAt: d.last_seen_at,
      })),
      activeSessions: sessions.length,
      recentSecurityLogs: securityLogs.slice(0, 20),
      recentActivityLogs: activityLogs.slice(0, 20),
    });
  } catch (err) {
    return apiFail(err);
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const token = getTokenFromRequest(request);
    await requireAdminFromToken(token ?? "");
    if (!isDbConfigured()) throw new ApiError(503, "SERVICE_UNAVAILABLE", "Licensing is not configured.");

    const { id } = await params;
    const customerId = Number(id);
    if (!Number.isFinite(customerId)) throw new ApiError(400, "INVALID_INPUT", "Invalid user id.");

    let body: { action?: string; password?: string } = {};
    try {
      body = await request.json();
    } catch {
      throw new ApiError(400, "INVALID_INPUT", "Invalid JSON body.");
    }

    const action = body.action;
    const lic = await getLicenseForCustomer(customerId);

    if (action === "suspend") {
      if (lic) await setLicStatus(lic.id, "suspended");
      await logSecurity("admin.user_suspended", `Suspended user ${customerId}`, { actorType: "admin", actorId: 0, actorRole: "admin", ip: request.headers.get("x-forwarded-for") ?? null });
      return apiOk({});
    }
    if (action === "activate") {
      if (lic) await setLicStatus(lic.id, "active");
      await logSecurity("admin.user_activated", `Activated user ${customerId}`, { actorType: "admin", actorId: 0, actorRole: "admin", ip: request.headers.get("x-forwarded-for") ?? null });
      return apiOk({});
    }
    if (action === "reset_password") {
      const password = (body.password ?? "").trim();
      if (password.length < 6) throw new ApiError(400, "INVALID_INPUT", "Password must be at least 6 characters.");
      await resetCustomerPassword(customerId, password);
      await revokeAllSessions(customerId);
      await logSecurity("admin.password_reset", `Reset password for user ${customerId}`, { actorType: "admin", actorId: 0, actorRole: "admin", ip: request.headers.get("x-forwarded-for") ?? null });
      return apiOk({});
    }
    if (action === "reset_devices") {
      const n = await resetAllDevices(customerId);
      await revokeAllSessions(customerId);
      await logSecurity("admin.devices_reset", `Reset ${n} device(s) for user ${customerId}`, { actorType: "admin", actorId: 0, actorRole: "admin", ip: request.headers.get("x-forwarded-for") ?? null });
      return apiOk({ reset: n });
    }

    throw new ApiError(400, "INVALID_ACTION", "Unknown action.");
  } catch (err) {
    return apiFail(err);
  }
}