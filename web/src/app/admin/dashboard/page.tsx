"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { adminGet, isLoggedIn } from "@/lib/admin-api";

interface Stats {
  customers: { total: number; active: number };
  licenses: { active: number; expired: number; suspended: number; total: number };
  devices: { total: number; active: number };
  activeSessions: number;
}

interface LogEntry {
  id: number;
  action: string;
  detail: string | null;
  ip: string | null;
  actor_role: string;
  created_at: number;
}

function fmtTs(ts: number): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

function statColor(label: string): string {
  if (label.includes("Active") || label.includes("active")) return "text-[#22C55E]";
  if (label.includes("Expired")) return "text-[#F97316]";
  if (label.includes("Suspended")) return "text-[#EF4444]";
  return "text-white";
}

function statBg(label: string): string {
  if (label.includes("Active") || label.includes("active")) return "border-[#22C55E]/20 bg-[#22C55E]/[.06]";
  if (label.includes("Expired")) return "border-[#F97316]/20 bg-[#F97316]/[.06]";
  if (label.includes("Suspended")) return "border-[#EF4444]/20 bg-[#EF4444]/[.06]";
  return "border-white/[.08] bg-white/[.03]";
}

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [securityLogs, setSecurityLogs] = useState<LogEntry[]>([]);
  const [activityLogs, setActivityLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isLoggedIn()) {
      router.replace("/admin/login");
      return;
    }
    try {
      const [s, sec, act] = await Promise.all([
        adminGet<Stats & { ok: boolean }>("/api/v1/admin/stats"),
        adminGet<{ ok: boolean; logs: LogEntry[] }>("/api/v1/admin/security?limit=10"),
        adminGet<{ ok: boolean; logs: LogEntry[] }>("/api/v1/admin/activity?limit=10"),
      ]);
      setStats(s);
      setSecurityLogs(sec.logs ?? []);
      setActivityLogs(act.logs ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    const interval = setInterval(() => void load(), 30000);
    return () => {
      clearTimeout(t);
      clearInterval(interval);
    };
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#2563EB] border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-[#EF4444]/25 bg-[#EF4444]/[.07] p-4 text-sm text-[#EF4444]">
        {error}
      </div>
    );
  }

  const cards = [
    { label: "Total Users", value: stats?.customers.total ?? 0 },
    { label: "Active Licenses", value: stats?.licenses.active ?? 0 },
    { label: "Expired Licenses", value: stats?.licenses.expired ?? 0 },
    { label: "Suspended Users", value: stats?.licenses.suspended ?? 0 },
    { label: "Registered Devices", value: stats?.devices.total ?? 0 },
    { label: "Active Sessions", value: stats?.activeSessions ?? 0 },
  ];

  return (
    <div className="space-y-6">
      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map((c) => (
          <div key={c.label} className={`rounded-xl border p-4 ${statBg(c.label)}`}>
            <p className="text-xs font-medium text-gray-400">{c.label}</p>
            <p className={`mt-1 text-2xl font-bold tabular-nums ${statColor(c.label)}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Tables row */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Security Logs */}
        <div className="rounded-xl border border-white/[.08] bg-[#111827]">
          <div className="border-b border-white/[.06] px-4 py-3">
            <h3 className="text-sm font-bold text-white">Recent Security Events</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-white/[.06] text-gray-400">
                <tr>
                  <th className="px-4 py-2 font-medium">Action</th>
                  <th className="px-4 py-2 font-medium">Detail</th>
                  <th className="px-4 py-2 font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {securityLogs.length === 0 ? (
                  <tr><td colSpan={3} className="px-4 py-6 text-center text-gray-500">No security events yet</td></tr>
                ) : securityLogs.map((log) => (
                  <tr key={log.id} className="border-b border-white/[.04] last:border-0">
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        log.action.includes("failed") || log.action.includes("revoked") || log.action.includes("suspended")
                          ? "bg-[#EF4444]/10 text-[#EF4444]"
                          : log.action.includes("success") || log.action.includes("created") || log.action.includes("activated")
                            ? "bg-[#22C55E]/10 text-[#22C55E]"
                            : "bg-[#2563EB]/10 text-[#2563EB]"
                      }`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="max-w-[200px] truncate px-4 py-2 text-gray-300">{log.detail ?? "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-gray-500">{fmtTs(log.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Activity Logs */}
        <div className="rounded-xl border border-white/[.08] bg-[#111827]">
          <div className="border-b border-white/[.06] px-4 py-3">
            <h3 className="text-sm font-bold text-white">Recent Activity</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-white/[.06] text-gray-400">
                <tr>
                  <th className="px-4 py-2 font-medium">Action</th>
                  <th className="px-4 py-2 font-medium">Detail</th>
                  <th className="px-4 py-2 font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {activityLogs.length === 0 ? (
                  <tr><td colSpan={3} className="px-4 py-6 text-center text-gray-500">No activity yet</td></tr>
                ) : activityLogs.map((log) => (
                  <tr key={log.id} className="border-b border-white/[.04] last:border-0">
                    <td className="px-4 py-2">
                      <span className="rounded-full bg-[#2563EB]/10 px-2 py-0.5 text-[10px] font-semibold text-[#2563EB]">
                        {log.action}
                      </span>
                    </td>
                    <td className="max-w-[200px] truncate px-4 py-2 text-gray-300">{log.detail ?? "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-gray-500">{fmtTs(log.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
