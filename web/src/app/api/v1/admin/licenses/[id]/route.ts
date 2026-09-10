import { NextRequest } from "next/server";
import { getTokenFromRequest, requireAdminFromToken, ApiError } from "@/lib/api-auth";
import { apiOk, apiFail } from "@/lib/api-v1";
import { getLicenseById, extendLicense, setLicenseStatus, setLicenseExpiry, changeLicensePlan, getPlanByCode, toPublicLicense, deriveLicenseStatus } from "@/lib/licensing";
import { findCustomerById } from "@/lib/customers";
import { isDbConfigured } from "@/lib/db";
import { logSecurity } from "@/lib/audit";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const token = getTokenFromRequest(request);
    await requireAdminFromToken(token ?? "");
    if (!isDbConfigured()) throw new ApiError(503, "SERVICE_UNAVAILABLE", "Licensing is not configured.");

    const { id } = await params;
    const licenseId = Number(id);
    if (!Number.isFinite(licenseId)) throw new ApiError(400, "INVALID_INPUT", "Invalid license id.");

    const lic = await getLicenseById(licenseId);
    if (!lic) throw new ApiError(404, "NOT_FOUND", "License not found.");

    const customer = await findCustomerById(lic.customer_id);

    return apiOk({
      license: { ...toPublicLicense(lic), id: lic.id, customerId: lic.customer_id, rawStatus: deriveLicenseStatus(lic) },
      customer: customer ? { id: customer.id, userId: customer.user_id, name: customer.name, status: customer.status } : null,
    });
  } catch (err) {
    return apiFail(err);
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const token = getTokenFromRequest(request);
    await requireAdminFromToken(token ?? "");
    if (!isDbConfigured()) throw new ApiError(503, "SERVICE_UNAVAILABLE", "Licensing is not configured.");

    const { id } = await params;
    const licenseId = Number(id);
    if (!Number.isFinite(licenseId)) throw new ApiError(400, "INVALID_INPUT", "Invalid license id.");

    const existing = await getLicenseById(licenseId);
    if (!existing) throw new ApiError(404, "NOT_FOUND", "License not found.");

    let body: Record<string, unknown> = {};
    try {
      body = await request.json();
    } catch {
      throw new ApiError(400, "INVALID_INPUT", "Invalid JSON body.");
    }

    const action = body.action as string | undefined;
    let updated = existing;

    if (action === "extend") {
      const days = Math.floor(Number(body.days ?? 0));
      if (!Number.isFinite(days) || days <= 0) throw new ApiError(400, "INVALID_INPUT", "days must be a positive number.");
      updated = (await extendLicense(licenseId, days)) ?? existing;
    } else if (action === "suspend") {
      updated = (await setLicenseStatus(licenseId, "suspended")) ?? existing;
    } else if (action === "activate") {
      updated = (await setLicenseStatus(licenseId, "active")) ?? existing;
    } else if (action === "revoke") {
      updated = (await setLicenseStatus(licenseId, "revoked")) ?? existing;
    } else if (action === "set_expiry") {
      const ts = Number(body.expiresAt);
      if (!Number.isFinite(ts) || ts <= 0) throw new ApiError(400, "INVALID_INPUT", "expiresAt must be a millisecond timestamp.");
      updated = (await setLicenseExpiry(licenseId, ts)) ?? existing;
    } else if (action === "change_plan") {
      const planCode = String(body.planCode ?? "").trim().toUpperCase();
      const plan = await getPlanByCode(planCode);
      if (!plan) throw new ApiError(400, "PLAN_NOT_FOUND", `Unknown plan '${planCode}'.`);
      updated = (await changeLicensePlan(licenseId, plan.id)) ?? existing;
    } else {
      throw new ApiError(400, "INVALID_ACTION", "Unknown action.");
    }

    await logSecurity("admin.license_updated", `Applied '${action}' to license ${updated.license_id}`, {
      actorType: "admin",
      actorId: 0,
      actorRole: "admin",
      ip: request.headers.get("x-forwarded-for") ?? null,
    });

    return apiOk({ license: toPublicLicense(updated) });
  } catch (err) {
    return apiFail(err);
  }
}