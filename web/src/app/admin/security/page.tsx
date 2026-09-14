"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { adminGet, isLoggedIn } from "@/lib/admin-api";

interface SecurityLog {
  id: number;
  actor_type: string;
  actor_id: number | null;
  actor_role: string;
  action: string;
  detail: string | null;
  ip: string | null;
  device_fp: string | null;
  created_at: number;
}

function fmtTs(ts: number): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

function severity(action: string): "danger" | "warn" | "info" | "success" {
  const a = action.toLowerCase();
  if (a.includes("failed") || a.includes("revoked") || a.includes("suspended") || a.includes("reject") || a.includes("suspicious") || a.includes("rate_limited")) return "danger";
  if (a.includes("expired") || a.includes("disabled") || a.includes("deactivated")) return "warn";
  if (a.includes("success") || a.includes("created") || a.includes("activated") || a.includes("reset")) return "success";
  return "info";
}

const badgeStyle = {
  danger: "bg-[#EF4444]/10 text-[#EF4444]",
  warn: "bg-[#F97316]/10 text-[#F97316]",
  success: "bg-[#22C55E]/10 text-[#22C55E]",
  info: "bg-[#2563EB]/10 text-[#2563EB]",
};

export default function SecurityLogsPage() {
  const router = useRouter();
  const [logs, setLogs] = useState<SecurityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(200);

  const load = useCallback(async () => {
    if (!isLoggedIn()) { router.replace("/admin/login"); return; }
    try {
      const data = await adminGet<{ ok: boolean; logs: SecurityLog[] }>(`/api/v1/admin/security?limit=${limit}`);
      setLogs(data.logs ?? []);
    } catch { /* */ }
    setLoading(false);
  }, [router, limit]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-[#2563EB] border-t-transparent" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">{logs.length} events</p>
        <div className="flex items-center gap-2">
          <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="rounded-lg border border-white/[.1] bg-white/[.04] px-3 py-1.5 text-xs text-white outline-none focus:border-[#2563EB]/60">
            <option value={100}>100</option>
            <option value={200}>200</option>
            <option value={500}>500</option>
          </select>
          <button onClick={() => load()} className="rounded-lg border border-white/[.1] px-3 py-1.5 text-xs text-gray-400 hover:text-white">Refresh</button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-white/[.08] bg-[#111827]">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-white/[.06] text-xs text-gray-400">
              <tr>
                <th className="px-4 py-3 font-medium">Severity</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Detail</th>
                <th className="px-4 py-3 font-medium">Actor</th>
                <th className="px-4 py-3 font-medium">IP</th>
                <th className="px-4 py-3 font-medium">Device FP</th>
                <th className="px-4 py-3 font-medium">Time</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">No security events</td></tr>
              ) : logs.map((l) => {
                const sev = severity(l.action);
                return (
                  <tr key={l.id} className="border-b border-white/[.04] last:border-0 hover:bg-white/[.02]">
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${badgeStyle[sev]}`}>{sev}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-[#2563EB]">{l.action}</td>
                    <td className="max-w-[260px] truncate px-4 py-3 text-xs text-gray-300">{l.detail ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-gray-400">{l.actor_role}{l.actor_id ? `#${l.actor_id}` : ""}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{l.ip ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{l.device_fp ?? "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs tabular-nums text-gray-500">{fmtTs(l.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}