import { NextRequest } from "next/server";
import { getTokenFromRequest, requireAdminFromToken, ApiError } from "@/lib/api-auth";
import { apiOk, apiFail } from "@/lib/api-v1";
import { isDbConfigured, getDb } from "@/lib/db";
import { countLicensesByStatus } from "@/lib/licensing";
import { listAllDevices } from "@/lib/devices";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const token = getTokenFromRequest(request);
    await requireAdminFromToken(token ?? "");
    if (!isDbConfigured()) throw new ApiError(503, "SERVICE_UNAVAILABLE", "Licensing is not configured.");

    const db = getDb();

    const customersRes = await db.execute("SELECT COUNT(*) AS n FROM customers");
    const totalCustomers = Number(customersRes.rows[0]?.n ?? 0);

    const activeCustomersRes = await db.execute("SELECT COUNT(*) AS n FROM customers WHERE status = 'active'");
    const activeCustomers = Number(activeCustomersRes.rows[0]?.n ?? 0);

    const licenseStats = await countLicensesByStatus();

    const devices = await listAllDevices();
    const activeDevices = devices.filter((d) => d.is_active).length;

    const sessionsRes = await db.execute("SELECT COUNT(*) AS n FROM sessions WHERE expires_at > ?", [Date.now()]);
    const activeSessions = Number(sessionsRes.rows[0]?.n ?? 0);

    return apiOk({
      customers: { total: totalCustomers, active: activeCustomers },
      licenses: licenseStats,
      devices: { total: devices.length, active: activeDevices },
      activeSessions,
    });
  } catch (err) {
    return apiFail(err);
  }
}
