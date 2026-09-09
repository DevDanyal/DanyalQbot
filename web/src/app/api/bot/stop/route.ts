import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { flaskFetch } from "@/lib/flask";

export const dynamic = "force-dynamic";

export async function POST(_request: NextRequest) {
  const session = await getSession();
  if (!session || session.role === "admin") {
    return Response.json({ ok: false, message: "Login required" }, { status: 401 });
  }
  try {
    const res = await flaskFetch("/api/bot/stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customer: String(session.customerId) }),
    });
    return Response.json(await res.json(), { status: res.status });
  } catch {
    return Response.json(
      { ok: false, message: "Backend offline" },
      { status: 502 },
    );
  }
}