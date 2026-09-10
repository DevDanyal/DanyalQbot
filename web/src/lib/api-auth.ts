import type { NextRequest } from "next/server";
import type { Client } from "@libsql/client";
import {
  getSessionByToken,
  type SessionRow,
} from "./db";
import { findCustomerById } from "./customers";
import {
  getLicenseForCustomer,
  toPublicLicense,
  deriveLicenseStatus,
  type PublicLicense,
} from "./licensing";
import { AUTH_COOKIE } from "./auth";

/**
 * API authentication & authorization layer.
 *
 * Sessions are opaque, server-issued tokens stored as SHA-256 hashes. They are
 * accepted via an `Authorization: Bearer <token>` header (for the mobile app
 * and any non-browser client) or via the existing session cookie (web).
 */

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }

  toJSON() {
    return {
      ok: false,
      error: { code: this.code, message: this.message },
    };
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

export function toApiError(err: unknown): ApiError {
  if (isApiError(err)) return err;
  return new ApiError(500, "INTERNAL_ERROR", "Internal server error");
}

export function extractBearerToken(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = /^Bearer\s+([A-Za-z0-9]{8,128})$/i.exec(value.trim());
  return m ? m[1] : null;
}

export function getTokenFromRequest(
  request: NextRequest,
  opts: { preferHeader?: boolean; cookieFallback?: boolean } = { cookieFallback: true },
): string | null {
  const header = extractBearerToken(request.headers.get("authorization"));
  if (header) return header;
  if (!opts.cookieFallback) return null;
  return request.cookies.get(AUTH_COOKIE)?.value ?? null;
}

export interface RequestMeta {
  ip?: string | null;
  userAgent?: string | null;
}

export interface ResolvedUser {
  id: number;
  userId: string;
  name: string;
}

export interface AuthContext {
  session: SessionRow;
  kind: "customer" | "admin";
  customer?: ResolvedUser;
  license?: PublicLicense | null;
}

/**
 * Resolves and validates a session token. Throws ApiError with a stable,
 * machine-readable `code` on any failure. This is the single server-side
 * gate shared by customer and admin API routes.
 */
export async function resolveAuthFromToken(
  token: string,
  db?: Client,
  _meta?: RequestMeta,
): Promise<AuthContext> {
  const session = await getSessionByToken(token, db);
  if (!session) {
    throw new ApiError(401, "AUTH_REQUIRED", "Missing or invalid session.");
  }
  if (session.expiresAt < Date.now()) {
    throw new ApiError(401, "TOKEN_EXPIRED", "Session expired. Please sign in again.");
  }

  if (session.role === "admin") {
    return { session, kind: "admin" };
  }

  const customer = await findCustomerById(session.customerId, db);
  if (!customer) {
    throw new ApiError(401, "ACCOUNT_NOT_FOUND", "Account no longer exists.");
  }
  if (customer.status !== "active") {
    throw new ApiError(403, "ACCOUNT_DISABLED", "This account is disabled.");
  }

  const lic = await getLicenseForCustomer(customer.id, db);
  if (!lic) {
    throw new ApiError(403, "LICENSE_MISSING", "No license is attached to this account.");
  }

  const status = deriveLicenseStatus(lic);
  if (status === "SUSPENDED") {
    throw new ApiError(403, "LICENSE_SUSPENDED", "This license is suspended.");
  }
  if (status === "EXPIRED") {
    throw new ApiError(403, "LICENSE_EXPIRED", "Your license has expired.");
  }

  return {
    session,
    kind: "customer",
    customer: { id: customer.id, userId: customer.user_id, name: customer.name },
    license: toPublicLicense(lic),
  };
}

export async function requireAdminFromToken(
  token: string,
  db?: Client,
): Promise<AuthContext> {
  const ctx = await resolveAuthFromToken(token, db);
  if (ctx.kind !== "admin") {
    throw new ApiError(403, "ADMIN_REQUIRED", "Admin access required.");
  }
  return ctx;
}