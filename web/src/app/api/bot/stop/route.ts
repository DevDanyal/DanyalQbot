import { flaskFetch } from "@/lib/flask";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const res = await flaskFetch("/api/bot/stop", { method: "POST" });
    return Response.json(await res.json(), { status: res.status });
  } catch {
    return Response.json(
      { ok: false, message: "Backend offline" },
      { status: 502 },
    );
  }
}
