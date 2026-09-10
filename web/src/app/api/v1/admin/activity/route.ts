import { NextRequest } from "next/server";
import { getTokenFromRequest, requireAdminFromToken } from "@/lib/api-auth";
import { apiOk, apiFail } from "@/lib/api-v1";
import { isDbConfigured } from "@/lib/db";
import { listActivityLogs } from "@/lib/audit";
import { ApiError } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const token = getTokenFromRequest(request);
    await requireAdminFromToken(token ?? "");
    if (!isDbConfigured()) throw new ApiError(503, "SERVICE_UNAVAILABLE", "Licensing is not configured.");

    const limit = Math.min(Number(request.nextUrl.searchParams.get("limit") ?? 200), 500);
    const customerIdParam = request.nextUrl.searchParams.get("customerId");
    const customerId = customerIdParam ? Number(customerIdParam) : undefined;

    const logs = await listActivityLogs({ limit, customerId: customerId && Number.isFinite(customerId) ? customerId : undefined });
    return apiOk({ logs });
  } catch (err) {
    return apiFail(err);
  }
}
