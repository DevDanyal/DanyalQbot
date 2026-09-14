import { NextRequest } from "next/server";
import { apiOk, apiFail } from "@/lib/api-v1";
import { getAppVersion } from "@/lib/app-version";
import { isDbConfigured } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    if (!isDbConfigured()) {
      return apiFail({ toJSON: () => ({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Service unavailable." } }), status: 503 });
    }
    const url = new URL(request.url);
    const platform = (url.searchParams.get("platform") ?? "android").trim().toLowerCase();
    const version = await getAppVersion(platform);
    if (!version) {
      return apiOk({
        platform,
        currentVersion: null,
        minimumVersion: null,
        latestVersion: null,
        releaseNotes: null,
        upToDate: null,
        updateRequired: null,
      });
    }
    return apiOk({
      platform: version.platform,
      currentVersion: version.currentVersion,
      minimumVersion: version.minimumVersion,
      latestVersion: version.latestVersion,
      releaseNotes: version.releaseNotes,
      updatedAt: version.updatedAt,
    });
  } catch (err) {
    return apiFail(err);
  }
}