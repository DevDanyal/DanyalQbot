import { NextRequest } from "next/server";
import {
  getTokenFromRequest,
  resolveAuthFromToken,
  ApiError,
} from "@/lib/api-auth";
import { apiOk, apiFail } from "@/lib/api-v1";
import { endAllSessions } from "@/lib/auth-service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const token = getTokenFromRequest(request);
    if (!token) throw new ApiError(401, "AUTH_REQUIRED", "Missing session token.");
    const ctx = await resolveAuthFromToken(token);
    if (ctx.kind !== "customer" || !ctx.customer) {
      throw new ApiError(403, "ADMIN_REQUIRED", "Logout-all is only valid for customer accounts.");
    }
    await endAllSessions(ctx.customer.id);
    return apiOk({});
  } catch (err) {
    return apiFail(err);
  }
}