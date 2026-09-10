import { NextRequest } from "next/server";
import { getTokenFromRequest, ApiError } from "@/lib/api-auth";
import { apiOk, apiFail } from "@/lib/api-v1";
import { endSession } from "@/lib/auth-service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const token = getTokenFromRequest(request);
    if (!token) throw new ApiError(401, "AUTH_REQUIRED", "Missing session token.");
    await endSession(token);
    return apiOk({});
  } catch (err) {
    return apiFail(err);
  }
}