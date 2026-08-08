const FLASK_URL = process.env.FLASK_URL ?? "http://127.0.0.1:8000";

export async function flaskFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const isGet = !init.method || init.method === "GET";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    return await fetch(`${FLASK_URL}${path}`, {
      ...init,
      ...(isGet ? { cache: "no-store" } : {}),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}
