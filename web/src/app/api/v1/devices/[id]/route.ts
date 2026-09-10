import { NextRequest } from "next/server";
import { getTokenFromRequest, resolveAuthFromToken, ApiError } from "@/lib/api-auth";
import { apiOk, apiFail } from "@/lib/api-v1";
import { revokeDevice } from "@/lib/devices";
import { logSecurity, logActivity } from "@/lib/audit";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const token = getTokenFromRequest(request);
    if (!token) throw new ApiError(401, "AUTH_REQUIRED", "Missing session token.");
    const ctx = await resolveAuthFromToken(token);
    if (ctx.kind !== "customer" || !ctx.customer) {
      throw new ApiError(403, "CUSTOMER_REQUIRED", "Customer account required.");
    }
    const { id } = await params;
    const deviceId = Number(id);
    if (!Number.isFinite(deviceId)) throw new ApiError(400, "INVALID_INPUT", "Invalid device id.");

    const device = await revokeDevice(deviceId, ctx.customer.id);
    if (!device) throw new ApiError(404, "NOT_FOUND", "Device not found.");

    await logSecurity("device.self_revoked", `Customer revoked own device #${device.id}`, {
      actorId: ctx.customer.id,
      ip: ctx.session.ip,
      deviceFp: ctx.session.deviceFp,
    });
    await logActivity(ctx.customer.id, "device.revoke", `Revoked device #${device.id}`, {}, undefined);

    return apiOk({ deviceId: device.id });
  } catch (err) {
    return apiFail(err);
  }
}