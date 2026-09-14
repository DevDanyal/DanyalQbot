"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { adminGet, adminPatch, adminPost, isLoggedIn } from "@/lib/admin-api";

interface Device {
  id: number;
  customerId: number;
  userId: string | null;
  label: string | null;
  platform: string | null;
  isActive: boolean;
  firstSeenAt: number;
  lastSeenAt: number;
  lastIp: string | null;
}

function fmtTs(ts: number): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

export default function DevicesPage() {
  const router = useRouter();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [actionBusy, setActionBusy] = useState<number | null>(null);
  const [resetId, setResetId] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!isLoggedIn()) { router.replace("/admin/login"); return; }
    try {
      const data = await adminGet<{ ok: boolean; devices: Device[] }>("/api/v1/admin/devices");
      setDevices(data.devices ?? []);
    } catch { /* */ }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const filtered = devices.filter((d) => {
    const q = search.toLowerCase();
    return (
      (d.userId ?? "").toLowerCase().includes(q) ||
      (d.label ?? "").toLowerCase().includes(q) ||
      (d.platform ?? "").toLowerCase().includes(q) ||
      (d.lastIp ?? "").toLowerCase().includes(q)
    );
  });

  const act = async (id: number, action: string) => {
    setActionBusy(id);
    try {
      await adminPatch(`/api/v1/admin/devices/${id}`, { action });
      await load();
    } catch { /* */ }
    setActionBusy(null);
  };

  const handleReset = async (customerId: number) => {
    setActionBusy(customerId);
    try {
      await adminPost(`/api/v1/admin/devices/reset/${customerId}`);
      await load();
    } catch { /* */ }
    setActionBusy(null);
    setResetId(null);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-[#2563EB] border-t-transparent" /></div>;
  }

  return (
    <div className="space-y-4">
      <input
        type="text"
        placeholder="Search by user, label, platform, IP..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full max-w-sm rounded-lg border border-white/[.1] bg-white/[.04] px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-[#2563EB]/60"
      />

      <div className="overflow-hidden rounded-xl border border-white/[.08] bg-[#111827]">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-white/[.06] text-xs text-gray-400">
              <tr>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Label</th>
                <th className="px-4 py-3 font-medium">Platform</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">First Seen</th>
                <th className="px-4 py-3 font-medium">Last Seen</th>
                <th className="px-4 py-3 font-medium">Last IP</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">No devices found</td></tr>
              ) : filtered.map((d) => (
                <tr key={d.id} className="border-b border-white/[.04] last:border-0 hover:bg-white/[.02]">
                  <td className="px-4 py-3 text-xs text-gray-300">{d.userId ?? `#${d.customerId}`}</td>
                  <td className="px-4 py-3 text-xs text-white">{d.label ?? "—"}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">{d.platform ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${d.isActive ? "bg-[#22C55E]/10 text-[#22C55E]" : "bg-[#EF4444]/10 text-[#EF4444]"}`}>
                      {d.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs tabular-nums text-gray-500">{fmtTs(d.firstSeenAt)}</td>
                  <td className="px-4 py-3 text-xs tabular-nums text-gray-500">{fmtTs(d.lastSeenAt)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{d.lastIp ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5 text-xs">
                      {d.isActive ? (
                        <>
                          <button onClick={() => act(d.id, "deactivate")} disabled={actionBusy === d.id} className="rounded-lg border border-[#F97316]/30 px-2 py-1 text-[#F97316]">Deactivate</button>
                          <button onClick={() => act(d.id, "revoke")} disabled={actionBusy === d.id} className="rounded-lg border border-[#EF4444]/30 px-2 py-1 text-[#EF4444]">Revoke</button>
                        </>
                      ) : (
                        <button onClick={() => act(d.id, "activate")} disabled={actionBusy === d.id} className="rounded-lg border border-[#22C55E]/30 px-2 py-1 text-[#22C55E]">Activate</button>
                      )}
                      <button onClick={() => setResetId(d.customerId)} className="rounded-lg border border-white/[.1] px-2 py-1 text-gray-400 hover:text-white">Reset</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reset modal */}
      {resetId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setResetId(null)}>
          <div className="w-full max-w-sm rounded-xl border border-white/[.1] bg-[#111827] p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-2 text-sm font-bold text-white">Reset All Devices</h3>
            <p className="mb-4 text-xs text-gray-400">This will deactivate all devices for customer #{resetId}. The customer can register a new device on next login.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setResetId(null)} className="rounded-lg px-3 py-1.5 text-xs text-gray-400 hover:text-white">Cancel</button>
              <button onClick={() => handleReset(resetId)} disabled={actionBusy === resetId} className="rounded-lg bg-[#EF4444] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">Reset Devices</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
