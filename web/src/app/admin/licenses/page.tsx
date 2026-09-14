"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { adminGet, adminPost, adminPatch, isLoggedIn } from "@/lib/admin-api";

interface License {
  id: number;
  customerId: number;
  licenseId: string;
  status: string;
  plan: { code: string; name: string } | null;
  startAt: number | null;
  expiresAt: number | null;
  deviceLimit: number;
}

function fmtTs(ts: number | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function statusBadge(status: string) {
  const s = status.toLowerCase();
  if (s === "active" || s === "active") return "bg-[#22C55E]/10 text-[#22C55E]";
  if (s === "expired") return "bg-[#F97316]/10 text-[#F97316]";
  if (s === "suspended" || s === "revoked") return "bg-[#EF4444]/10 text-[#EF4444]";
  return "bg-gray-500/10 text-gray-400";
}

export default function LicensesPage() {
  const router = useRouter();
  const [licenses, setLicenses] = useState<License[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ customerId: "", planCode: "PRO", days: 30 });
  const [createMsg, setCreateMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [extendId, setExtendId] = useState<number | null>(null);
  const [extendDays, setExtendDays] = useState(30);
  const [actionBusy, setActionBusy] = useState<number | null>(null);
  const [changePlanId, setChangePlanId] = useState<number | null>(null);
  const [changePlanCode, setChangePlanCode] = useState("PRO");

  const load = useCallback(async () => {
    if (!isLoggedIn()) { router.replace("/admin/login"); return; }
    try {
      const params = filter !== "all" ? `?status=${filter}` : "";
      const data = await adminGet<{ ok: boolean; licenses: License[] }>(`/api/v1/admin/licenses${params}`);
      setLicenses(data.licenses ?? []);
    } catch { /* */ }
    setLoading(false);
  }, [router, filter]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateMsg(null);
    try {
      await adminPost("/api/v1/admin/licenses", {
        customerId: Number(createForm.customerId),
        planCode: createForm.planCode,
        days: createForm.days,
      });
      setCreateMsg({ ok: true, text: "License created" });
      setCreateForm({ customerId: "", planCode: "PRO", days: 30 });
      setShowCreate(false);
      await load();
    } catch (err) {
      setCreateMsg({ ok: false, text: err instanceof Error ? err.message : "Failed" });
    }
  };

  const act = async (id: number, action: string, extra?: Record<string, unknown>) => {
    setActionBusy(id);
    try {
      await adminPatch(`/api/v1/admin/licenses/${id}`, { action, ...extra });
      await load();
    } catch { /* */ }
    setActionBusy(null);
  };

  const handleExtend = async (id: number) => {
    await act(id, "extend", { days: extendDays });
    setExtendId(null);
  };

  const handleChangePlan = async (id: number) => {
    await act(id, "change_plan", { planCode: changePlanCode });
    setChangePlanId(null);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-[#2563EB] border-t-transparent" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {["all", "active", "suspended", "expired"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                filter === f ? "bg-[#2563EB] text-white" : "border border-white/[.1] text-gray-400 hover:text-white"
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <button
          onClick={() => { setShowCreate(!showCreate); setCreateMsg(null); }}
          className="rounded-lg bg-[#2563EB] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#2563EB]/80"
        >
          {showCreate ? "Cancel" : "+ Create License"}
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <form onSubmit={handleCreate} className="rounded-xl border border-white/[.08] bg-[#111827] p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <input placeholder="Customer ID" type="number" required value={createForm.customerId} onChange={(e) => setCreateForm({ ...createForm, customerId: e.target.value })} className="rounded-lg border border-white/[.1] bg-white/[.04] px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-[#2563EB]/60" />
            <select value={createForm.planCode} onChange={(e) => setCreateForm({ ...createForm, planCode: e.target.value })} className="rounded-lg border border-white/[.1] bg-white/[.04] px-3 py-2 text-sm text-white outline-none focus:border-[#2563EB]/60">
              <option value="FREE">Free</option>
              <option value="PRO">Pro</option>
              <option value="PREMIUM">Premium</option>
              <option value="YEARLY">Yearly</option>
            </select>
            <input type="number" min={1} placeholder="Days" value={createForm.days} onChange={(e) => setCreateForm({ ...createForm, days: Number(e.target.value) })} className="rounded-lg border border-white/[.1] bg-white/[.04] px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-[#2563EB]/60" />
            <button type="submit" className="rounded-lg bg-[#22C55E] py-2 text-sm font-bold text-white transition hover:bg-[#22C55E]/80">Create</button>
          </div>
          {createMsg && <p className={`mt-3 text-xs ${createMsg.ok ? "text-[#22C55E]" : "text-[#EF4444]"}`}>{createMsg.text}</p>}
        </form>
      )}

      {/* Licenses table */}
      <div className="overflow-hidden rounded-xl border border-white/[.08] bg-[#111827]">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-white/[.06] text-xs text-gray-400">
              <tr>
                <th className="px-4 py-3 font-medium">License ID</th>
                <th className="px-4 py-3 font-medium">User ID</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Start</th>
                <th className="px-4 py-3 font-medium">Expiry</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {licenses.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">No licenses found</td></tr>
              ) : licenses.map((l) => (
                <tr key={l.id} className="border-b border-white/[.04] last:border-0 hover:bg-white/[.02]">
                  <td className="px-4 py-3 font-mono text-xs text-[#2563EB]">{l.licenseId}</td>
                  <td className="px-4 py-3 text-xs text-gray-300">#{l.customerId}</td>
                  <td className="px-4 py-3 text-xs text-gray-300">{l.plan?.code ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusBadge(l.status)}`}>{l.status}</span>
                  </td>
                  <td className="px-4 py-3 text-xs tabular-nums text-gray-400">{fmtTs(l.startAt)}</td>
                  <td className="px-4 py-3 text-xs tabular-nums text-gray-400">{fmtTs(l.expiresAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5 text-xs">
                      {l.status === "active" ? (
                        <>
                          <button onClick={() => { setExtendId(l.id); setExtendDays(30); }} className="rounded-lg border border-[#2563EB]/30 px-2 py-1 text-[#2563EB] hover:bg-[#2563EB]/10">Extend</button>
                          <button onClick={() => act(l.id, "suspend")} disabled={actionBusy === l.id} className="rounded-lg border border-[#F97316]/30 px-2 py-1 text-[#F97316]">Suspend</button>
                          <button onClick={() => act(l.id, "revoke")} disabled={actionBusy === l.id} className="rounded-lg border border-[#EF4444]/30 px-2 py-1 text-[#EF4444]">Revoke</button>
                        </>
                      ) : (
                        <button onClick={() => act(l.id, "activate")} disabled={actionBusy === l.id} className="rounded-lg border border-[#22C55E]/30 px-2 py-1 text-[#22C55E]">Activate</button>
                      )}
                      <button onClick={() => { setChangePlanId(l.id); setChangePlanCode(l.plan?.code ?? "PRO"); }} className="rounded-lg border border-white/[.1] px-2 py-1 text-gray-400 hover:text-white">Plan</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Extend modal */}
      {extendId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setExtendId(null)}>
          <div className="w-full max-w-sm rounded-xl border border-white/[.1] bg-[#111827] p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 text-sm font-bold text-white">Extend License</h3>
            <input type="number" min={1} value={extendDays} onChange={(e) => setExtendDays(Number(e.target.value))} className="mb-3 w-full rounded-lg border border-white/[.1] bg-white/[.04] px-3 py-2 text-sm text-white outline-none focus:border-[#2563EB]/60" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setExtendId(null)} className="rounded-lg px-3 py-1.5 text-xs text-gray-400 hover:text-white">Cancel</button>
              <button onClick={() => handleExtend(extendId)} className="rounded-lg bg-[#2563EB] px-3 py-1.5 text-xs font-bold text-white">Extend +{extendDays}d</button>
            </div>
          </div>
        </div>
      )}

      {/* Change plan modal */}
      {changePlanId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setChangePlanId(null)}>
          <div className="w-full max-w-sm rounded-xl border border-white/[.1] bg-[#111827] p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 text-sm font-bold text-white">Change Plan</h3>
            <select value={changePlanCode} onChange={(e) => setChangePlanCode(e.target.value)} className="mb-3 w-full rounded-lg border border-white/[.1] bg-white/[.04] px-3 py-2 text-sm text-white outline-none focus:border-[#2563EB]/60">
              <option value="FREE">Free</option>
              <option value="PRO">Pro</option>
              <option value="PREMIUM">Premium</option>
              <option value="YEARLY">Yearly</option>
            </select>
            <div className="flex justify-end gap-2">
              <button onClick={() => setChangePlanId(null)} className="rounded-lg px-3 py-1.5 text-xs text-gray-400 hover:text-white">Cancel</button>
              <button onClick={() => handleChangePlan(changePlanId)} className="rounded-lg bg-[#2563EB] px-3 py-1.5 text-xs font-bold text-white">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
