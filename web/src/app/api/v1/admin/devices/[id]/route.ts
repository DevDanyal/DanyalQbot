import { NextRequest } from "next/server";
import { getTokenFromRequest, requireAdminFromToken, ApiError } from "@/lib/api-auth";
import { apiOk, apiFail } from "@/lib/api-v1";
import { isDbConfigured } from "@/lib/db";
import { revokeDevice, setDeviceActive } from "@/lib/devices";
import { logSecurity } from "@/lib/audit";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const token = getTokenFromRequest(request);
    await requireAdminFromToken(token ?? "");
    if (!isDbConfigured()) throw new ApiError(503, "SERVICE_UNAVAILABLE", "Licensing is not configured.");

    const { id } = await params;
    const deviceId = Number(id);
    if (!Number.isFinite(deviceId)) throw new ApiError(400, "INVALID_INPUT", "Invalid device id.");

    let body: { action?: string } = {};
    try {
      body = await request.json();
    } catch {
      throw new ApiError(400, "INVALID_INPUT", "Invalid JSON body.");
    }

    const action = body.action;
    if (action === "revoke") {
      const device = await revokeDevice(deviceId);
      if (!device) throw new ApiError(404, "NOT_FOUND", "Device not found.");
      await logSecurity("admin.device_revoked", `Admin revoked device #${deviceId}`, {
        actorType: "admin",
        actorId: 0,
        actorRole: "admin",
        ip: request.headers.get("x-forwarded-for") ?? null,
      });
      return apiOk({ device: { id: device.id, isActive: device.is_active } });
    }
    if (action === "deactivate") {
      const device = await setDeviceActive(deviceId, false);
      if (!device) throw new ApiError(404, "NOT_FOUND", "Device not found.");
      await logSecurity("admin.device_deactivated", `Admin deactivated device #${deviceId}`, {
        actorType: "admin",
        actorId: 0,
        actorRole: "admin",
        ip: request.headers.get("x-forwarded-for") ?? null,
      });
      return apiOk({ device: { id: device.id, isActive: device.is_active } });
    }
    if (action === "activate") {
      const device = await setDeviceActive(deviceId, true);
      if (!device) throw new ApiError(404, "NOT_FOUND", "Device not found.");
      await logSecurity("admin.device_activated", `Admin activated device #${deviceId}`, {
        actorType: "admin",
        actorId: 0,
        actorRole: "admin",
        ip: request.headers.get("x-forwarded-for") ?? null,
      });
      return apiOk({ device: { id: device.id, isActive: device.is_active } });
    }

    throw new ApiError(400, "INVALID_ACTION", "Unknown action. Use: revoke, deactivate, activate.");
  } catch (err) {
    return apiFail(err);
  }
}
