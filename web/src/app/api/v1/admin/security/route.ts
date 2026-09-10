import { NextRequest } from "next/server";
import { getTokenFromRequest, requireAdminFromToken } from "@/lib/api-auth";
import { apiOk, apiFail } from "@/lib/api-v1";
import { isDbConfigured } from "@/lib/db";
import { listSecurityLogs } from "@/lib/audit";
import { ApiError } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const token = getTokenFromRequest(request);
    await requireAdminFromToken(token ?? "");
    if (!isDbConfigured()) throw new ApiError(503, "SERVICE_UNAVAILABLE", "Licensing is not configured.");

    const limit = Math.min(Number(request.nextUrl.searchParams.get("limit") ?? 200), 500);
    const actorIdParam = request.nextUrl.searchParams.get("actorId");
    const actorId = actorIdParam ? Number(actorIdParam) : undefined;

    const logs = await listSecurityLogs({ limit, actorId: actorId && Number.isFinite(actorId) ? actorId : undefined });
    return apiOk({ logs });
  } catch (err) {
    return apiFail(err);
  }
}
