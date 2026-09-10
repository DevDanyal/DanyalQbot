import { NextRequest } from "next/server";
import { getTokenFromRequest, requireAdminFromToken, ApiError } from "@/lib/api-auth";
import { apiOk, apiFail } from "@/lib/api-v1";
import { isDbConfigured } from "@/lib/db";
import { getPlanById, updatePlan } from "@/lib/licensing";
import { logSecurity } from "@/lib/audit";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const token = getTokenFromRequest(request);
    await requireAdminFromToken(token ?? "");
    if (!isDbConfigured()) throw new ApiError(503, "SERVICE_UNAVAILABLE", "Licensing is not configured.");

    const { id } = await params;
    const planId = Number(id);
    if (!Number.isFinite(planId)) throw new ApiError(400, "INVALID_INPUT", "Invalid plan id.");

    const existing = await getPlanById(planId);
    if (!existing) throw new ApiError(404, "NOT_FOUND", "Plan not found.");

    let body: Record<string, unknown> = {};
    try {
      body = await request.json();
    } catch {
      throw new ApiError(400, "INVALID_INPUT", "Invalid JSON body.");
    }

    const patch: Record<string, unknown> = {};
    if (body.name !== undefined) patch.name = String(body.name).trim();
    if (body.durationDays !== undefined) patch.duration_days = Number(body.durationDays);
    if (body.deviceLimit !== undefined) patch.device_limit = Number(body.deviceLimit);
    if (body.priceCents !== undefined) patch.price_cents = Number(body.priceCents);
    if (body.description !== undefined) patch.description = body.description;
    if (body.status !== undefined) {
      const s = String(body.status);
      if (!["active", "disabled"].includes(s)) throw new ApiError(400, "INVALID_INPUT", "status must be 'active' or 'disabled'.");
      patch.status = s;
    }

    if (Object.keys(patch).length === 0) throw new ApiError(400, "INVALID_INPUT", "No fields to update.");

    const updated = await updatePlan(planId, patch);
    if (!updated) throw new ApiError(500, "UPDATE_FAILED", "Failed to update plan.");

    await logSecurity("admin.plan_updated", `Updated plan ${updated.code}`, {
      actorType: "admin",
      actorId: 0,
      actorRole: "admin",
      ip: request.headers.get("x-forwarded-for") ?? null,
    });

    return apiOk({ plan: updated });
  } catch (err) {
    return apiFail(err);
  }
}
