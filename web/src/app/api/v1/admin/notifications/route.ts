import { NextRequest } from "next/server";
import { getTokenFromRequest, requireAdminFromToken, ApiError } from "@/lib/api-auth";
import { apiOk, apiFail } from "@/lib/api-v1";
import { listAllNotifications, announceToAll } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const token = getTokenFromRequest(request);
    if (!token) throw new ApiError(401, "AUTH_REQUIRED", "Missing admin token.");
    await requireAdminFromToken(token);
    const url = new URL(request.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 100, 1), 300);
    const notifications = await listAllNotifications({ limit });
    return apiOk({ notifications });
  } catch (err) {
    return apiFail(err);
  }
}

export async function POST(request: NextRequest) {
  let body: { title?: string; body?: string };
  try {
    body = await request.json();
  } catch {
    return apiFail(new ApiError(400, "INVALID_INPUT", "Invalid JSON body."));
  }
  const title = (body.title ?? "").trim();
  const bodyText = (body.body ?? "").trim();
  if (!title) {
    return apiFail(new ApiError(400, "INVALID_INPUT", "Announcement title is required."));
  }
  if (title.length > 200) {
    return apiFail(new ApiError(400, "INVALID_INPUT", "Title too long (max 200 characters)."));
  }
  try {
    const token = getTokenFromRequest(request);
    if (!token) throw new ApiError(401, "AUTH_REQUIRED", "Missing admin token.");
    await requireAdminFromToken(token);
    const count = await announceToAll(title, bodyText);
    return apiOk({ announcedTo: count });
  } catch (err) {
    return apiFail(err);
  }
}