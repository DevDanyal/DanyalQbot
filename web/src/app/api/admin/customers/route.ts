import { NextRequest, NextResponse } from "next/server";
import { isDbConfigured, initSchema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { listCustomers, createCustomer } from "@/lib/customers";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, message: "Licensing not configured." }, { status: 503 });
  }
  await initSchema();
  const customers = await listCustomers();
  return NextResponse.json({ ok: true, customers });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, message: "Licensing not configured." }, { status: 503 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid body" }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  const password = (body.password ?? "").trim();
  const userId = (body.userId ?? "").trim().toUpperCase();
  const days = Number(body.days ?? 30);

  if (!name || !password || !userId) {
    return NextResponse.json(
      { ok: false, message: "Name, User ID and password are required." },
      { status: 400 },
    );
  }
  if (password.length < 6) {
    return NextResponse.json(
      { ok: false, message: "Password must be at least 6 characters." },
      { status: 400 },
    );
  }

  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  try {
    const customer = await createCustomer({ userId, name, password, expiresAt });
    return NextResponse.json({ ok: true, customer });
  } catch (err) {
    const msg =
      err instanceof Error && err.message.includes("UNIQUE")
        ? "That User ID already exists."
        : "Could not create customer.";
    return NextResponse.json({ ok: false, message: msg }, { status: 400 });
  }
}
