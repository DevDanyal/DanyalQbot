import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSession } from "@/lib/db";
import { AUTH_COOKIE, getClientIp } from "@/lib/auth";
import { timingSafeEqual } from "crypto";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let body: { password?: string } = {};
  try {
    body = await request.json();
  } catch {
    /* ignore */
  }

  const adminPassword = process.env.ADMIN_PASSWORD;
  const provided = body.password ?? "";

  if (!adminPassword) {
    return NextResponse.json(
      { ok: false, message: "Admin is not configured on the server." },
      { status: 503 },
    );
  }

  void getClientIp(request.headers);

  const given = Buffer.from(provided);
  const expected = Buffer.from(adminPassword);
  const ok =
    given.length === expected.length &&
    timingSafeEqual(given, expected);

  if (!ok) {
    return NextResponse.json({ ok: false, message: "Invalid admin password." }, { status: 401 });
  }

  // Admin session lasts 12 hours.
  const token = await createSession(null, "admin", 12 * 60 * 60 * 1000);
  const store = await cookies();
  store.set(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 12 * 60 * 60,
  });

  return NextResponse.json({ ok: true });
}
