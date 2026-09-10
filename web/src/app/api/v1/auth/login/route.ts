import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { loginFlow } from "@/lib/auth-service";
import { getClientIp } from "@/lib/auth";
import { isDbConfigured } from "@/lib/db";
import { ApiError } from "@/lib/api-auth";
import { apiOk, apiFail } from "@/lib/api-v1";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isDbConfigured()) {
    return apiFail(new ApiError(503, "SERVICE_UNAVAILABLE", "Licensing is not configured on the server."));
  }

  let body: {
    userId?: string;
    password?: string;
    deviceKey?: string;
    platform?: string;
    label?: string;
  } = {};
  try {
    body = await request.json();
  } catch {
    /* default */
  }

  const result = await loginFlow(
    {
      userId: body.userId,
      password: body.password,
      deviceKey: body.deviceKey,
      platform: body.platform,
      label: body.label,
    },
    {
      ip: getClientIp(request.headers),
      userAgent: request.headers.get("user-agent") ?? null,
    },
  );

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: { code: result.code, message: result.message } },
      { status: result.status },
    );
  }

  return apiOk({
    token: result.token,
    user: result.user,
    license: result.license,
    device: result.device,
  });
}