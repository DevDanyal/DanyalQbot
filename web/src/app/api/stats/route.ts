import { getSession } from "@/lib/auth";
import { flaskFetch } from "@/lib/flask";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session || session.role === "admin") {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const res = await flaskFetch(`/api/stats?customer=${session.customerId}`);
    return Response.json(await res.json(), { status: res.status });
  } catch {
    return Response.json({ error: "offline" }, { status: 502 });
  }
}