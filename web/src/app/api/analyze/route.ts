import { NextRequest } from "next/server";
import { flaskFetch } from "@/lib/flask";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const res = await flaskFetch("/api/analyze", { method: "POST", body: form });
    return Response.json(await res.json(), { status: res.status });
  } catch {
    return Response.json(
      { ok: false, error: "Backend offline — start it with: python run_web.py" },
      { status: 502 },
    );
  }
}
