import { NextRequest } from "next/server";
import { getTokenFromRequest, resolveAuthFromToken, ApiError } from "@/lib/api-auth";
import { apiOk, apiFail } from "@/lib/api-v1";
import { getLicenseForCustomer, toPublicLicense, deriveLicenseStatus } from "@/lib/licensing";
import { listDevicesByCustomer } from "@/lib/devices";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const token = getTokenFromRequest(request);
    if (!token) throw new ApiError(401, "AUTH_REQUIRED", "Missing session token.");
    const ctx = await resolveAuthFromToken(token);
    if (ctx.kind !== "customer" || !ctx.customer) {
      throw new ApiError(403, "CUSTOMER_REQUIRED", "Customer account required.");
    }
    const lic = await getLicenseForCustomer(ctx.customer.id);
    const devices = await listDevicesByCustomer(ctx.customer.id);
    return apiOk({
      license: lic ? toPublicLicense(lic) : null,
      rawStatus: lic ? deriveLicenseStatus(lic) : null,
      devices: devices.map((d) => ({
        id: d.id,
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