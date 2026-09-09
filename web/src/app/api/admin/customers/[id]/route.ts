import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { updateCustomerStatus, extendCustomerExpiry } from "@/lib/customers";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const customerId = Number(id);
  if (!Number.isFinite(customerId)) {
    return NextResponse.json({ ok: false, message: "Invalid id" }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid body" }, { status: 400 });
  }

  if (typeof body.action === "string" && body.action !== "extend" && customerId >= 0) {
    const valid = ["active", "suspended", "revoked"].includes(body.action);
    if (valid) {
      await updateCustomerStatus(customerId, body.action);
      return NextResponse.json({ ok: true });
    }
  }

  if (body.action === "extend") {
    const days = Number(body.days ?? 0);
    if (Number.isFinite(days) && days > 0) {
      const updated = await extendCustomerExpiry(customerId, days);
      if (updated) return NextResponse.json({ ok: true, customer: updated });
      return NextResponse.json({ ok: false, message: "Customer not found" }, { status: 404 });
    }
  }

  return NextResponse.json({ ok: false, message: "Invalid action" }, { status: 400 });
}
