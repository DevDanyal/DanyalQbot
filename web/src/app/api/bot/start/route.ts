import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { decryptSecret, getActiveQuotexAccount, getQuotexAccount } from "@/lib/db";
import { flaskFetch } from "@/lib/flask";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role === "admin") {
    return Response.json({ ok: false, message: "Login required" }, { status: 401 });
  }

  let body: { mock?: boolean; accountId?: number } = {};
  try {
    body = await request.json();
  } catch {
    /* default */
  }
  const mock = Boolean(body.mock);
  const payload: {
    mock: boolean;
    customer: string;
    email?: string;
    password?: string;
    mode?: "demo" | "live";
  } = { mock, customer: String(session.customerId) };

  if (!mock) {
    const account =
      body.accountId != null
        ? await getQuotexAccount(Number(body.accountId), session.customerId)
        : await getActiveQuotexAccount(session.customerId);
    if (!account) {
      return Response.json(
        { ok: false, message: "Connect a Quotex account first." },
        { status: 400 },
      );
    }
    let password: string;
    try {
      password = decryptSecret(account.passwordEnc);
    } catch {
      return Response.json(
        { ok: false, message: "Stored account cannot be decrypted — reconnect it." },
        { status: 500 },
      );
    }
    payload.email = account.email;
    payload.password = password;
    payload.mode = account.mode;
  }

  try {
    const res = await flaskFetch("/api/bot/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return Response.json(await res.json(), { status: res.status });
  } catch {
    return Response.json(
      { ok: false, message: "Backend offline" },
      { status: 502 },
    );
  }
}