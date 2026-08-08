import { NextRequest } from "next/server";
import { flaskFetch } from "@/lib/flask";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let mock = false;
  try {
    mock = Boolean((await request.json()).mock);
  } catch {
    /* missing/invalid body -> default to real mode */
  }
  try {
    const res = await flaskFetch("/api/bot/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mock }),
    });
    return Response.json(await res.json(), { status: res.status });
  } catch {
    return Response.json(
      { ok: false, message: "Backend offline" },
      { status: 502 },
    );
  }
}
