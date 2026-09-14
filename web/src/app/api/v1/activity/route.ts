import { NextRequest } from "next/server";
import { getTokenFromRequest, resolveAuthFromToken, ApiError } from "@/lib/api-auth";
import { apiOk, apiFail } from "@/lib/api-v1";
import { listActivityLogs } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const token = getTokenFromRequest(request);
    if (!token) throw new ApiError(401, "AUTH_REQUIRED", "Missing session token.");
    const ctx = await resolveAuthFromToken(token);
    if (ctx.kind !== "customer" || !ctx.customer) {
      throw new ApiError(403, "CUSTOMER_REQUIRED", "Customer account required.");
    }
    const url = new URL(request.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 25, 1), 100);
    const logs = await listActivityLogs({ customerId: ctx.customer.id, limit });
    return apiOk({
      activity: logs.map((l) => ({
        id: l.id,
        action: l.action,
        detail: l.detail,
        createdAt: l.created_at,
      })),
    });
  } catch (err) {
    return apiFail(err);
  }
}