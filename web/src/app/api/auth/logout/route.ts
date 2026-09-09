import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { deleteSession } from "@/lib/db";
import { AUTH_COOKIE } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  const store = await cookies();
  const token = store.get(AUTH_COOKIE)?.value;
  if (token) {
    await deleteSession(token);
  }
  store.delete(AUTH_COOKIE);
  return NextResponse.json({ ok: true });
}
