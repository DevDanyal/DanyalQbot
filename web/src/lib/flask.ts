const FLASK_URL = process.env.FLASK_URL ?? "http://127.0.0.1:8000";
const BOT_TOKEN = process.env.BOT_AUTH_TOKEN ?? "";

export async function flaskFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const isGet = !init.method || init.method === "GET";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  const headers = new Headers(init.headers);
  if (BOT_TOKEN) {
    headers.set("x-bot-token", BOT_TOKEN);
  }
  try {
    return await fetch(`${FLASK_URL}${path}`, {
      ...init,
      headers,
      ...(isGet ? { cache: "no-store" } : {}),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}
