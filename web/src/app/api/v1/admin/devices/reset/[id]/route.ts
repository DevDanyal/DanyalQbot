import { NextRequest } from "next/server";
import { getTokenFromRequest, requireAdminFromToken, ApiError } from "@/lib/api-auth";
import { apiOk, apiFail } from "@/lib/api-v1";
import { isDbConfigured, revokeAllSessions } from "@/lib/db";
import { resetAllDevices } from "@/lib/devices";
import { logSecurity } from "@/lib/audit";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const token = getTokenFromRequest(request);
    await requireAdminFromToken(token ?? "");
    if (!isDbConfigured()) throw new ApiError(503, "SERVICE_UNAVAILABLE", "Licensing is not configured.");

    const { id } = await params;
    const customerId = Number(id);
    if (!Number.isFinite(customerId)) throw new ApiError(400, "INVALID_INPUT", "Invalid customer id.");

    const n = await resetAllDevices(customerId);
    await revokeAllSessions(customerId);
    await logSecurity("admin.devices_reset", `Admin reset ${n} device(s) for customer ${customerId}`, {
      actorType: "admin",
      actorId: 0,
      actorRole: "admin",
      ip: request.headers.get("x-forwarded-for") ?? null,
    });

    return apiOk({ reset: n });
  } catch (err) {
    return apiFail(err);
  }
}
