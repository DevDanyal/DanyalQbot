import { NextRequest } from "next/server";
import {
  getTokenFromRequest,
  resolveAuthFromToken,
  ApiError,
} from "@/lib/api-auth";
import { apiOk, apiFail, sanitizeSession } from "@/lib/api-v1";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const token = getTokenFromRequest(request);
    if (!token) throw new ApiError(401, "AUTH_REQUIRED", "Missing session token.");
    const ctx = await resolveAuthFromToken(token);
    return apiOk({
      authenticated: true,
      role: ctx.kind,
      user: ctx.customer ?? null,
      license: ctx.license ?? null,
      session: sanitizeSession(ctx.session),
    });
  } catch (err) {
    return apiFail(err);
  }
}