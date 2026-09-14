"use client";

const ADMIN_TOKEN_KEY = "admin_token";
const ADMIN_OK_COOKIE = "qx_admin_ok";
const OK_COOKIE_MAX_AGE = 12 * 60 * 60; // matches the 12h admin session

export function getAdminToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

export function setAdminToken(token: string): void {
  localStorage.setItem(ADMIN_TOKEN_KEY, token);
  if (typeof document !== "undefined") {
    document.cookie = `${ADMIN_OK_COOKIE}=1; path=/; max-age=${OK_COOKIE_MAX_AGE}; SameSite=Lax`;
  }
}

export function clearAdminToken(): void {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
  if (typeof document !== "undefined") {
    document.cookie = `${ADMIN_OK_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
  }
}

export function isLoggedIn(): boolean {
  return getAdminToken() !== null;
}

export async function adminFetch(
  url: string,
  opts?: RequestInit,
): Promise<Response> {
  const token = getAdminToken();
  if (!token) throw new Error("No admin session");
  return fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...opts?.headers,
    },
  });
}

export async function adminGet<T = Record<string, unknown>>(
  url: string,
): Promise<T> {
  const res = await adminFetch(url);
  if (res.status === 401) {
    clearAdminToken();
    if (typeof window !== "undefined")
      window.location.href = "/admin/login";
    throw new Error("Session expired");
  }
  const data = await res.json();
  if (!data.ok)
    throw new Error(data.error?.message ?? "Request failed");
  return data as T;
}

export async function adminPost<T = Record<string, unknown>>(
  url: string,
  body?: unknown,
): Promise<T> {
  const res = await adminFetch(url, {
    method: "POST",
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    clearAdminToken();
    if (typeof window !== "undefined")
      window.location.href = "/admin/login";
    throw new Error("Session expired");
  }
  const data = await res.json();
  if (!data.ok)
    throw new Error(data.error?.message ?? "Request failed");
  return data as T;
}

export async function adminPatch<T = Record<string, unknown>>(
  url: string,
  body?: unknown,
): Promise<T> {
  const res = await adminFetch(url, {
    method: "PATCH",
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    clearAdminToken();
    if (typeof window !== "undefined")
      window.location.href = "/admin/login";
    throw new Error("Session expired");
  }
  const data = await res.json();
  if (!data.ok)
    throw new Error(data.error?.message ?? "Request failed");
  return data as T;
}
