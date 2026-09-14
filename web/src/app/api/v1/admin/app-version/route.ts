import { NextRequest } from "next/server";
import { getTokenFromRequest, requireAdminFromToken, ApiError } from "@/lib/api-auth";
import { apiOk, apiFail } from "@/lib/api-v1";
import { getAllVersions, upsertAppVersion } from "@/lib/app-version";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const token = getTokenFromRequest(request);
    if (!token) throw new ApiError(401, "AUTH_REQUIRED", "Missing admin token.");
    await requireAdminFromToken(token);
    const versions = await getAllVersions();
    return apiOk({ versions });
  } catch (err) {
    return apiFail(err);
  }
}

export async function POST(request: NextRequest) {
  let body: {
    platform?: string;
    currentVersion?: string;
    minimumVersion?: string;
    latestVersion?: string;
    releaseNotes?: string;
  };
  try {
    body = await request.json();
  } catch {
    return apiFail(new ApiError(400, "INVALID_INPUT", "Invalid JSON body."));
  }
  const platform = (body.platform ?? "").trim();
  if (!platform) {
    return apiFail(new ApiError(400, "INVALID_INPUT", "Platform is required (android, ios, web)."));
  }
  if (["android", "ios", "web"].includes(platform) === false) {
    return apiFail(new ApiError(400, "INVALID_INPUT", "Platform must be android, ios, or web."));
  }
  if (!body.currentVersion && !body.minimumVersion && !body.latestVersion) {
    return apiFail(new ApiError(400, "INVALID_INPUT", "At least one version field is required."));
  }
  try {
    const token = getTokenFromRequest(request);
    if (!token) throw new ApiError(401, "AUTH_REQUIRED", "Missing admin token.");
    await requireAdminFromToken(token);
    const updated = await upsertAppVersion({
      platform,
      currentVersion: body.currentVersion,
      minimumVersion: body.minimumVersion,
      latestVersion: body.latestVersion,
      releaseNotes: body.releaseNotes,
    });
    return apiOk({ version: updated });
  } catch (err) {
    return apiFail(err);
  }
}