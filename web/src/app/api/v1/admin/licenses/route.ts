import { NextRequest } from "next/server";
import { getTokenFromRequest, requireAdminFromToken, ApiError } from "@/lib/api-auth";
import { apiOk, apiFail } from "@/lib/api-v1";
import { listLicenses, getPlanByCode, createLicenseForCustomer, getLicenseForCustomer, toPublicLicense } from "@/lib/licensing";
import { findCustomerById } from "@/lib/customers";
import { isDbConfigured } from "@/lib/db";
import { logSecurity } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const token = getTokenFromRequest(request);
    await requireAdminFromToken(token ?? "");
    if (!isDbConfigured()) throw new ApiError(503, "SERVICE_UNAVAILABLE", "Licensing is not configured.");

    const statusParam = request.nextUrl.searchParams.get("status");
    const statusMap: Record<string, "active" | "suspended" | "revoked" | "expired"> = {
      active: "active",
      suspended: "suspended",
      revoked: "revoked",
      expired: "expired",
    };
    const status = statusParam ? statusMap[statusParam] : undefined;
    const licenses = await listLicenses(status ? { status } : {});
    return apiOk({
      licenses: licenses.map((l) => ({ ...toPublicLicense(l), id: l.id, customerId: l.customer_id })),
    });
  } catch (err) {
    return apiFail(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = getTokenFromRequest(request);
    await requireAdminFromToken(token ?? "");
    if (!isDbConfigured()) throw new ApiError(503, "SERVICE_UNAVAILABLE", "Licensing is not configured.");

    let body: { customerId?: number; planCode?: string; days?: number } = {};
    try {
      body = await request.json();
    } catch {
      throw new ApiError(400, "INVALID_INPUT", "Invalid JSON body.");
    }

    const customerId = Number(body.customerId);
    const planCode = (body.planCode ?? "PRO").trim().toUpperCase();
    const days = body.days != null ? Math.floor(Number(body.days)) : null;

    if (!Number.isFinite(customerId)) throw new ApiError(400, "INVALID_INPUT", "customerId is required.");
    const customer = await findCustomerById(customerId);
    if (!customer) throw new ApiError(404, "NOT_FOUND", "Customer not found.");
    if (await getLicenseForCustomer(customerId)) {
      throw new ApiError(409, "LICENSE_EXISTS", "This customer already has a license.");
    }
    const plan = await getPlanByCode(planCode);
    if (!plan) throw new ApiError(400, "PLAN_NOT_FOUND", `Unknown plan '${planCode}'.`);

    const lic = await createLicenseForCustomer({
      customerId,
      plan,
      expiresAt: days != null ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).getTime() : undefined,
    });

    await logSecurity("admin.license_created", `Created license ${lic.license_id} (${plan.code}) for user ${customerId}`, {
      actorType: "admin",
      actorId: 0,
      actorRole: "admin",
      ip: request.headers.get("x-forwarded-for") ?? null,
    });

    return apiOk({ license: toPublicLicense(lic) });
  } catch (err) {
    return apiFail(err);
  }
}