import { NextRequest } from "next/server";
import { getTokenFromRequest, requireAdminFromToken } from "@/lib/api-auth";
import { apiOk, apiFail } from "@/lib/api-v1";
import { isDbConfigured } from "@/lib/db";
import { listAllDevices } from "@/lib/devices";
import { ApiError } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const token = getTokenFromRequest(request);
    await requireAdminFromToken(token ?? "");
    if (!isDbConfigured()) throw new ApiError(503, "SERVICE_UNAVAILABLE", "Licensing is not configured.");

    const devices = await listAllDevices();
    return apiOk({
      devices: devices.map((d) => ({
        id: d.id,
        customerId: d.customer_id,
        userId: d.user_id,
        label: d.label,
        platform: d.platform,
        isActive: d.is_active,
        firstSeenAt: d.first_seen_at,
        lastSeenAt: d.last_seen_at,
        lastIp: d.last_ip,
      })),
    });
  } catch (err) {
    return apiFail(err);
  }
}
