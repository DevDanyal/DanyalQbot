import { NextRequest } from "next/server";
import { getTokenFromRequest, resolveAuthFromToken, ApiError } from "@/lib/api-auth";
import { apiOk, apiFail } from "@/lib/api-v1";
import { listNotifications, unreadCount } from "@/lib/notifications";

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
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 50, 1), 200);
    const notifications = await listNotifications(ctx.customer.id, { limit });
    const unread = await unreadCount(ctx.customer.id);
    return apiOk({ notifications, unreadCount: unread });
  } catch (err) {
    return apiFail(err);
  }
}