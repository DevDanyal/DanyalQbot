import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  deleteQuotexAccount,
  listQuotexAccounts,
  saveQuotexAccount,
  setActiveQuotexAccount,
} from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session || session.role === "admin") {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }
  const accounts = await listQuotexAccounts(session.customerId);
  return NextResponse.json({ ok: true, accounts });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role === "admin") {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }
  let body: { email?: string; password?: string; mode?: string; activeId?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid body" }, { status: 400 });
  }

  const email = (body.email ?? "").trim();
  const password = body.password ?? "";
  const mode = body.mode === "live" ? "live" : "demo";

  if (body.activeId !== undefined) {
    await setActiveQuotexAccount(Number(body.activeId), session.customerId);
    return NextResponse.json({ ok: true });
  }

  if (!email.includes("@")) {
    return NextResponse.json({ ok: false, message: "Enter a valid Quotex login email." }, { status: 400 });
  }
  if (password.length < 4) {
    return NextResponse.json({ ok: false, message: "Password is too short." }, { status: 400 });
  }
  try {
    const id = await saveQuotexAccount(session.customerId, email, password, mode);
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "Could not save account." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role === "admin") {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const id = Number(url.searchParams.get("id"));
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ ok: false, message: "Invalid id" }, { status: 400 });
  }
  await deleteQuotexAccount(id, session.customerId);
  return NextResponse.json({ ok: true });
}