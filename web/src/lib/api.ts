import type {
  ActionResponse,
  AnalyzeResponse,
  BotStatus,
  HistoryResponse,
  Stats,
} from "./types";

export async function getStatus(): Promise<BotStatus> {
  const res = await fetch("/api/bot/status", { cache: "no-store" });
  if (!res.ok) throw new Error("Backend offline");
  return res.json();
}

export async function getStats(): Promise<Stats> {
  const res = await fetch("/api/stats", { cache: "no-store" });
  if (!res.ok) throw new Error("Backend offline");
  return res.json();
}

export async function getHistory(): Promise<HistoryResponse> {
  const res = await fetch("/api/history", { cache: "no-store" });
  if (!res.ok) throw new Error("Backend offline");
  return res.json();
}

export async function analyzeChart(file: File): Promise<AnalyzeResponse> {
  const fd = new FormData();
  fd.append("image", file);
  let res: Response;
  try {
    res = await fetch("/api/analyze", { method: "POST", body: fd });
  } catch {
    return { ok: false, error: "Network error — is the dashboard reachable?" };
  }
  if (!res.ok) {
    let msg = `Upload failed (${res.status})`;
    try {
      const j = (await res.json()) as { error?: string };
      msg = j.error ?? msg;
    } catch {
      /* keep default */
    }
    return { ok: false, error: msg };
  }
  return res.json();
}

export async function botAction(
  action: "start" | "stop",
  mock = false,
): Promise<ActionResponse> {
  let res: Response;
  try {
    res = await fetch(`/api/bot/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mock }),
    });
  } catch {
    return {
      ok: false,
      message: "Backend offline — start it with: python run_web.py",
    };
  }
  if (!res.ok) {
    let msg = `Backend error (${res.status})`;
    try {
      const j = (await res.json()) as { message?: string };
      msg = j.message ?? msg;
    } catch {
      /* keep default */
    }
    return { ok: false, message: msg };
  }
  return res.json();
}
