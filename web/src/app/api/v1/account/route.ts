import { NextRequest } from "next/server";
import { getTokenFromRequest, resolveAuthFromToken, ApiError } from "@/lib/api-auth";
import { apiOk, apiFail } from "@/lib/api-v1";
import { getCustomerProfile } from "@/lib/customers";
import { getLicenseForCustomer, toPublicLicense, deriveLicenseStatus } from "@/lib/licensing";
import { listDevicesByCustomer } from "@/lib/devices";
import { unreadCount } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const token = getTokenFromRequest(request);
    if (!token) throw new ApiError(401, "AUTH_REQUIRED", "Missing session token.");
    const ctx = await resolveAuthFromToken(token);
    if (ctx.kind !== "customer" || !ctx.customer) {
      throw new ApiError(403, "CUSTOMER_REQUIRED", "Customer account required.");
    }

    const profile = await getCustomerProfile(ctx.customer.id);
    if (!profile) throw new ApiError(404, "ACCOUNT_NOT_FOUND", "Account not found.");

    const lic = await getLicenseForCustomer(ctx.customer.id);
    const devices = await listDevicesByCustomer(ctx.customer.id);
    const unread = await unreadCount(ctx.customer.id);

    return apiOk({
      user: {
        name: profile.name,
        userId: profile.user_id,
        memberSince: profile.created_at,
        lastLogin: profile.last_login,
        lastIp: profile.last_ip,
        status: profile.status,
      },
      license: lic ? toPublicLicense(lic) : null,
      licenseStatus: lic ? deriveLicenseStatus(lic) : null,
      devices: devices.map((d) => ({
        id: d.id,
        label: d.label,
        platform: d.platform,
        isActive: d.is_active,
        firstSeenAt: d.first_seen_at,
        lastSeenAt: d.last_seen_at,
        lastIp: d.last_ip,
      })),
      registeredDevices: profile.registeredDevices,
      notificationsUnread: unread,
    });
  } catch (err) {
    return apiFail(err);
  }
}