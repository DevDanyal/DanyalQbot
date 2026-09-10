import { NextResponse } from "next/server";
import { toApiError } from "./api-auth";

/**
 * Small response helpers used by all /api/v1 routes so error shape and
 * status codes stay consistent. Errors never leak stack traces or internals.
 */

export function apiOk(data: Record<string, unknown> = {}): NextResponse {
  return NextResponse.json({ ok: true, ...data });
}

export function apiFail(err: unknown): NextResponse {
  const e = toApiError(err);
  return NextResponse.json(e.toJSON(), { status: e.status });
}

export function sanitizeSession(session: {
  id: number;
  customerId: number;
  role: string;
  deviceFp: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: number;
  expiresAt: number;
}) {
  return {
    id: session.id,
    customerId: session.customerId,
    role: session.role,
    deviceFp: session.deviceFp,
    ip: session.ip,
    userAgent: session.userAgent,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
  };
}