import { flaskFetch } from "@/lib/flask";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await flaskFetch("/api/history");
    return Response.json(await res.json(), { status: res.status });
  } catch {
    return Response.json({ error: "offline" }, { status: 502 });
  }
}
