"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { adminGet, isLoggedIn } from "@/lib/admin-api";

interface ActivityLog {
  id: number;
  customer_id: number | null;
  action: string;
  detail: string | null;
  meta: string | null;
  created_at: number;
}

function fmtTs(ts: number): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

export default function ActivityLogsPage() {
  const router = useRouter();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(200);
  const [filterCustomer, setFilterCustomer] = useState("");
  const [metaParsed, setMetaParsed] = useState<Record<number, Record<string, unknown>>>({});

  const load = useCallback(async () => {
    if (!isLoggedIn()) { router.replace("/admin/login"); return; }
    try {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      if (filterCustomer) params.set("customerId", filterCustomer);
      const data = await adminGet<{ ok: boolean; logs: ActivityLog[] }>(`/api/v1/admin/activity?${params}`);
      setLogs(data.logs ?? []);
      const parsed: Record<number, Record<string, unknown>> = {};
      for (const l of data.logs ?? []) {
        try { parsed[l.id] = l.meta ? JSON.parse(l.meta) : {}; } catch { parsed[l.id] = {}; }
      }
      setMetaParsed(parsed);
    } catch { /* */ }
    setLoading(false);
  }, [router, limit, filterCustomer]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-[#2563EB] border-t-transparent" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <input
            type="number"
            placeholder="Filter by customer ID"
            value={filterCustomer}
            onChange={(e) => setFilterCustomer(e.target.value)}
            className="w-40 rounded-lg border border-white/[.1] bg-white/[.04] px-3 py-1.5 text-xs text-white placeholder-gray-500 outline-none focus:border-[#2563EB]/60"
          />
          <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="rounded-lg border border-white/[.1] bg-white/[.04] px-3 py-1.5 text-xs text-white outline-none focus:border-[#2563EB]/60">
            <option value={100}>100</option>
            <option value={200}>200</option>
            <option value={500}>500</option>
          </select>
          <button onClick={() => load()} className="rounded-lg border border-white/[.1] px-3 py-1.5 text-xs text-gray-400 hover:text-white">Refresh</button>
        </div>
        <p className="text-xs text-gray-500">{logs.length} entries</p>
      </div>

      <div className="overflow-hidden rounded-xl border border-white/[.08] bg-[#111827]">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-white/[.06] text-xs text-gray-400">
              <tr>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Result</th>
                <th className="px-4 py-3 font-medium">Detail</th>
                <th className="px-4 py-3 font-medium">Meta</th>
                <th className="px-4 py-3 font-medium">Time</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">No activity logged</td></tr>
              ) : logs.map((l) => {
                const meta = metaParsed[l.id] ?? {};
                const metaStr = Object.entries(meta).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`).join(", ");
                return (
                  <tr key={l.id} className="border-b border-white/[.04] last:border-0 hover:bg-white/[.02]">
                    <td className="px-4 py-3 text-xs text-gray-300">{l.customer_id ? `#${l.customer_id}` : "—"}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-[#2563EB]/10 px-2 py-0.5 text-[10px] font-semibold text-[#2563EB]">{l.action}</span>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        (l.detail ?? "").toLowerCase().includes("fail") || (l.detail ?? "").toLowerCase().includes("error")
                          ? "bg-[#EF4444]/10 text-[#EF4444]"
                          : "bg-[#22C55E]/10 text-[#22C55E]"
                      }`}>
                        {l.detail?.toLowerCase().includes("fail") || l.detail?.toLowerCase().includes("error") ? "Failed" : "Success"}
                      </span>
                    </td>
                    <td className="max-w-[240px] truncate px-4 py-3 text-xs text-gray-300">{l.detail ?? "—"}</td>
                    <td className="max-w-[180px] truncate px-4 py-3 font-mono text-[11px] text-gray-500">{metaStr || "—"}</td>
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