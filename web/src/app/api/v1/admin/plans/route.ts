import { NextRequest } from "next/server";
import { getTokenFromRequest, requireAdminFromToken, ApiError } from "@/lib/api-auth";
import { apiOk, apiFail } from "@/lib/api-v1";
import { isDbConfigured } from "@/lib/db";
import { listPlans, createPlan } from "@/lib/licensing";
import { logSecurity } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const token = getTokenFromRequest(request);
    await requireAdminFromToken(token ?? "");
    if (!isDbConfigured()) throw new ApiError(503, "SERVICE_UNAVAILABLE", "Licensing is not configured.");

    const plans = await listPlans();
    return apiOk({ plans });
  } catch (err) {
    return apiFail(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = getTokenFromRequest(request);
    await requireAdminFromToken(token ?? "");
    if (!isDbConfigured()) throw new ApiError(503, "SERVICE_UNAVAILABLE", "Licensing is not configured.");

    let body: {
      code?: string;
      name?: string;
      durationDays?: number;
      deviceLimit?: number;
      priceCents?: number;
      description?: string;
    } = {};
    try {
      body = await request.json();
    } catch {
      throw new ApiError(400, "INVALID_INPUT", "Invalid JSON body.");
    }

    const code = (body.code ?? "").trim();
    const name = (body.name ?? "").trim();
    const durationDays = Number(body.durationDays ?? 0);
    const deviceLimit = Number(body.deviceLimit ?? 1);

    if (!code || !name) throw new ApiError(400, "INVALID_INPUT", "code and name are required.");
    if (!Number.isFinite(durationDays) || durationDays <= 0) throw new ApiError(400, "INVALID_INPUT", "durationDays must be a positive number.");
    if (!Number.isFinite(deviceLimit) || deviceLimit <= 0) throw new ApiError(400, "INVALID_INPUT", "deviceLimit must be a positive number.");

    const plan = await createPlan({
      code,
      name,
      durationDays,
      deviceLimit,
      priceCents: body.priceCents,
      description: body.description,
    });

    await logSecurity("admin.plan_created", `Created plan ${plan.code}`, {
      actorType: "admin",
      actorId: 0,
      actorRole: "admin",
      ip: request.headers.get("x-forwarded-for") ?? null,
    });

    return apiOk({ plan });
  } catch (err) {
    return apiFail(err);
  }
}
