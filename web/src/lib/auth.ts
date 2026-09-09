import { cookies } from "next/headers";
import { getSessionUser, type SessionUser } from "./db";

export const AUTH_COOKIE = "qx_session";

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function getSession(): Promise<SessionUser | null> {
  try {
    const store = await cookies();
    const token = store.get(AUTH_COOKIE)?.value;
    if (!token) return null;
    return await getSessionUser(token);
  } catch {
    return null;
  }
}

export async function getSessionToken(): Promise<string | null> {
  try {
    const store = await cookies();
    return store.get(AUTH_COOKIE)?.value ?? null;
  } catch {
    return null;
  }
}

/**
 * Stable-ish device fingerprint from request headers. Good enough to
 * deter casual sharing across devices; not a hard security boundary.
 */
export function deviceFingerprint(headers: Headers): string {
  const ua = headers.get("user-agent") ?? "";
  const acceptLang = headers.get("accept-language") ?? "";
  const encoded = `${ua}|${acceptLang}`;
  let hash = 0;
  for (let i = 0; i < encoded.length; i++) {
    hash = (hash << 5) - hash + encoded.charCodeAt(i);
    hash |= 0;
  }
  return `D${Math.abs(hash).toString(36).toUpperCase()}`;
}

export function getClientIp(headers: Headers): string | null {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}
