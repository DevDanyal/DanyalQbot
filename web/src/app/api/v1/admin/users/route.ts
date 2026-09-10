import { NextRequest } from "next/server";
import { getTokenFromRequest, requireAdminFromToken, ApiError } from "@/lib/api-auth";
import { apiOk, apiFail } from "@/lib/api-v1";
import { listCustomers, createCustomer } from "@/lib/customers";
import { getLicenseForCustomer, getPlanByCode, createLicenseForCustomer, toPublicLicense, deriveLicenseStatus } from "@/lib/licensing";
import { isDbConfigured } from "@/lib/db";
import { logSecurity } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const token = getTokenFromRequest(request);
    const ctx = await requireAdminFromToken(token ?? "");
    void ctx;
    if (!isDbConfigured()) throw new ApiError(503, "SERVICE_UNAVAILABLE", "Licensing is not configured.");

    const customers = await listCustomers();
    const users = [];
    for (const c of customers) {
      const lic = await getLicenseForCustomer(c.id);
      users.push({
        ...c,
        license: lic ? toPublicLicense(lic) : null,
        licenseStatus: lic ? deriveLicenseStatus(lic) : null,
      });
    }
    return apiOk({ users });
  } catch (err) {
    return apiFail(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = getTokenFromRequest(request);
    await requireAdminFromToken(token ?? "");
    if (!isDbConfigured()) throw new ApiError(503, "SERVICE_UNAVAILABLE", "Licensing is not configured.");

    let body: { name?: string; userId?: string; password?: string; planCode?: string; days?: number } = {};
    try {
      body = await request.json();
    } catch {
      throw new ApiError(400, "INVALID_INPUT", "Invalid JSON body.");
    }

    const name = (body.name ?? "").trim();
    const userId = (body.userId ?? "").trim().toUpperCase();
    const password = (body.password ?? "").trim();
    const planCode = (body.planCode ?? "PRO").trim().toUpperCase();
    const days = body.days != null ? Math.floor(Number(body.days)) : null;

    if (!name || !userId || !password) {
      throw new ApiError(400, "INVALID_INPUT", "Name, User ID and password are required.");
    }
    if (password.length < 6) {
      throw new ApiError(400, "INVALID_INPUT", "Password must be at least 6 characters.");
    }
    if (days != null && (!Number.isFinite(days) || days <= 0)) {
      throw new ApiError(400, "INVALID_INPUT", "days must be a positive number.");
    }

    const plan = await getPlanByCode(planCode);
    if (!plan) throw new ApiError(400, "PLAN_NOT_FOUND", `Unknown plan '${planCode}'.`);

    let customer;
    try {
      customer = await createCustomer({
        userId,
        name,
        password,
        expiresAt: null,
      });
    } catch (err) {
      const msg = err instanceof Error && err.message.includes("UNIQUE")
        ? "That User ID already exists."
        : "Could not create user.";
      const code = err instanceof Error && err.message.includes("UNIQUE") ? "USER_EXISTS" : "CREATE_FAILED";
      throw new ApiError(code === "USER_EXISTS" ? 409 : 400, code, msg);
    }

    const lic = await createLicenseForCustomer({
      customerId: customer.id,
      plan,
      expiresAt: days != null ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).getTime() : undefined,
    });

    await logSecurity("admin.user_created", `Created user ${userId} with plan ${plan.code}`, {
      actorType: "admin",
      actorId: 0,
      actorRole: "admin",
      ip: request.headers.get("x-forwarded-for") ?? null,
    });

    return apiOk({ user: { ...customer, license: toPublicLicense(lic) } });
  } catch (err) {
    return apiFail(err);
  }
}