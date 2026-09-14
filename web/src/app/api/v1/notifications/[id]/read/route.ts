import { NextRequest } from "next/server";
import { getTokenFromRequest, resolveAuthFromToken, ApiError } from "@/lib/api-auth";
import { apiOk, apiFail } from "@/lib/api-v1";
import { markRead } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const token = getTokenFromRequest(request);
    if (!token) throw new ApiError(401, "AUTH_REQUIRED", "Missing session token.");
    const ctx = await resolveAuthFromToken(token);
    if (ctx.kind !== "customer" || !ctx.customer) {
      throw new ApiError(403, "CUSTOMER_REQUIRED", "Customer account required.");
    }
    const { id } = await params;
    const notificationId = Number(id);
    if (!Number.isFinite(notificationId) || notificationId <= 0) {
      throw new ApiError(400, "INVALID_INPUT", "Invalid notification id.");
    }
    const updated = await markRead(notificationId, ctx.customer.id);
    if (!updated) throw new ApiError(404, "NOT_FOUND", "Notification not found.");
    return apiOk({ id: notificationId });
  } catch (err) {
    return apiFail(err);
  }
}