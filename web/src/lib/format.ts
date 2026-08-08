export function fmtMoney(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function fmtSigned(n: number | null | undefined, decimals = 2): string {
  if (n == null || Number.isNaN(n)) return "—";
  const v = Number(n);
  return (v > 0 ? "+" : "") + v.toFixed(decimals);
}

export function fmtUptime(sec: number): string {
  if (!sec || sec < 0) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return [h ? `${h}h` : null, m ? `${m}m` : null, `${s}s`]
    .filter(Boolean)
    .join(" ");
}

export function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function fmtTradeTime(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export function dirLabel(direction: string): string {
  const d = (direction || "").toLowerCase();
  if (d === "buy" || d === "call") return "Buy";
  if (d === "sell" || d === "put") return "Sell";
  return direction || "—";
}

export function isBuy(direction: string): boolean {
  const d = (direction || "").toLowerCase();
  return d === "buy" || d === "call";
}
