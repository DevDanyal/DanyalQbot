"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { adminGet, adminPost, adminPatch, isLoggedIn } from "@/lib/admin-api";

interface Plan {
  id: number;
  code: string;
  name: string;
  duration_days: number;
  device_limit: number;
  price_cents: number;
  description: string | null;
  status: string;
  created_at: number;
  updated_at: number;
}

function fmtPrice(cents: number): string {
  if (cents === 0) return "Free";
  return `$${(cents / 100).toFixed(2)}`;
}

export default function PlansPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ code: "", name: "", durationDays: 30, deviceLimit: 1, priceCents: 0, description: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [actionBusy, setActionBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!isLoggedIn()) { router.replace("/admin/login"); return; }
    try {
      const data = await adminGet<{ ok: boolean; plans: Plan[] }>("/api/v1/admin/plans");
      setPlans(data.plans ?? []);
    } catch { /* */ }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      await adminPost("/api/v1/admin/plans", form);
      setMsg({ ok: true, text: `Created plan ${form.code}` });
      setForm({ code: "", name: "", durationDays: 30, deviceLimit: 1, priceCents: 0, description: "" });
      setShowCreate(false);
      await load();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Failed" });
    }
  };

  const handleUpdate = async () => {
    if (editId === null) return;
    setMsg(null);
    try {
      await adminPatch(`/api/v1/admin/plans/${editId}`, {
        name: form.name,
        durationDays: form.durationDays,
        deviceLimit: form.deviceLimit,
        priceCents: form.priceCents,
        description: form.description,
      });
      setMsg({ ok: true, text: "Plan updated" });
      setEditId(null);
      await load();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Failed" });
    }
  };

  const toggleStatus = async (plan: Plan) => {
    setActionBusy(plan.id);
    try {
      await adminPatch(`/api/v1/admin/plans/${plan.id}`, {
        status: plan.status === "active" ? "disabled" : "active",
      });
      await load();
    } catch { /* */ }
    setActionBusy(null);
  };

  const startEdit = (plan: Plan) => {
    setEditId(plan.id);
    setForm({
      code: plan.code,
      name: plan.name,
      durationDays: plan.duration_days,
      deviceLimit: plan.device_limit,
      priceCents: plan.price_cents,
      description: plan.description ?? "",
    });
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-[#2563EB] border-t-transparent" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm text-gray-400">{plans.length} plan(s)</h2>
        <button
          onClick={() => { setShowCreate(!showCreate); setEditId(null); setMsg(null); }}
          className="rounded-lg bg-[#2563EB] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#2563EB]/80"
        >
          {showCreate ? "Cancel" : "+ Create Plan"}
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <form onSubmit={handleCreate} className="rounded-xl border border-white/[.08] bg-[#111827] p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <input placeholder="Code (e.g. PRO2)" required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} className="rounded-lg border border-white/[.1] bg-white/[.04] px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-[#2563EB]/60" />
            <input placeholder="Name (e.g. Pro 2)" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-lg border border-white/[.1] bg-white/[.04] px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-[#2563EB]/60" />
            <input type="number" min={1} placeholder="Duration (days)" required value={form.durationDays} onChange={(e) => setForm({ ...form, durationDays: Number(e.target.value) })} className="rounded-lg border border-white/[.1] bg-white/[.04] px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-[#2563EB]/60" />
            <input type="number" min={1} placeholder="Device limit" required value={form.deviceLimit} onChange={(e) => setForm({ ...form, deviceLimit: Number(e.target.value) })} className="rounded-lg border border-white/[.1] bg-white/[.04] px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-[#2563EB]/60" />
            <input type="number" min={0} placeholder="Price (cents)" value={form.priceCents} onChange={(e) => setForm({ ...form, priceCents: Number(e.target.value) })} className="rounded-lg border border-white/[.1] bg-white/[.04] px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-[#2563EB]/60" />
            <button type="submit" className="rounded-lg bg-[#22C55E] py-2 text-sm font-bold text-white transition hover:bg-[#22C55E]/80">Create</button>
          </div>
          <input placeholder="Description (optional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-3 w-full rounded-lg border border-white/[.1] bg-white/[.04] px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-[#2563EB]/60" />
          {msg && <p className={`mt-3 text-xs ${msg.ok ? "text-[#22C55E]" : "text-[#EF4444]"}`}>{msg.text}</p>}
        </form>
      )}

      {/* Plans grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((p) => (
          <div key={p.id} className="rounded-xl border border-white/[.08] bg-[#111827] p-4">
            {editId === p.id ? (
              <div className="space-y-2">
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-lg border border-white/[.1] bg-white/[.04] px-3 py-1.5 text-sm text-white outline-none focus:border-[#2563EB]/60" />
                <div className="grid grid-cols-2 gap-2">
                  <input type="number" min={1} value={form.durationDays} onChange={(e) => setForm({ ...form, durationDays: Number(e.target.value) })} className="rounded-lg border border-white/[.1] bg-white/[.04] px-3 py-1.5 text-sm text-white outline-none focus:border-[#2563EB]/60" placeholder="Days" />
                  <input type="number" min={1} value={form.deviceLimit} onChange={(e) => setForm({ ...form, deviceLimit: Number(e.target.value) })} className="rounded-lg border border-white/[.1] bg-white/[.04] px-3 py-1.5 text-sm text-white outline-none focus:border-[#2563EB]/60" placeholder="Devices" />
                </div>
                <input type="number" min={0} value={form.priceCents} onChange={(e) => setForm({ ...form, priceCents: Number(e.target.value) })} className="w-full rounded-lg border border-white/[.1] bg-white/[.04] px-3 py-1.5 text-sm text-white outline-none focus:border-[#2563EB]/60" placeholder="Price (cents)" />
                <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full rounded-lg border border-white/[.1] bg-white/[.04] px-3 py-1.5 text-sm text-white outline-none focus:border-[#2563EB]/60" placeholder="Description" />
                <div className="flex gap-2">
                  <button onClick={handleUpdate} className="rounded-lg bg-[#2563EB] px-3 py-1.5 text-xs font-bold text-white">Save</button>
                  <button onClick={() => setEditId(null)} className="rounded-lg px-3 py-1.5 text-xs text-gray-400 hover:text-white">Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <span className="rounded-full bg-[#2563EB]/10 px-2.5 py-0.5 text-xs font-bold text-[#2563EB]">{p.code}</span>
                    <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${p.status === "active" ? "bg-[#22C55E]/10 text-[#22C55E]" : "bg-gray-500/10 text-gray-400"}`}>
                      {p.status}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => startEdit(p)} className="rounded p-1 text-gray-400 hover:text-white">
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button onClick={() => toggleStatus(p)} disabled={actionBusy === p.id} className="rounded p-1 text-gray-400 hover:text-white">
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                    </button>
                  </div>
                </div>
                <p className="mb-1 text-sm font-bold text-white">{p.name}</p>
                <p className="mb-3 text-xs text-gray-400">{p.description || "No description"}</p>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-lg bg-white/[.03] p-2">
                    <p className="text-gray-500">Duration</p>
                    <p className="mt-0.5 font-bold text-white">{p.duration_days}d</p>
                  </div>
                  <div className="rounded-lg bg-white/[.03] p-2">
                    <p className="text-gray-500">Devices</p>
                    <p className="mt-0.5 font-bold text-white">{p.device_limit}</p>
                  </div>
                  <div className="rounded-lg bg-white/[.03] p-2">
                    <p className="text-gray-500">Price</p>
                    <p className="mt-0.5 font-bold text-white">{fmtPrice(p.price_cents)}</p>
                  </div>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {msg && !showCreate && editId === null && (
        <div className={`rounded-xl border px-4 py-3 text-xs ${msg.ok ? "border-[#22C55E]/25 bg-[#22C55E]/[.07] text-[#22C55E]" : "border-[#EF4444]/25 bg-[#EF4444]/[.07] text-[#EF4444]"}`}>
          {msg.text}
        </div>
      )}
    </div>
  );
}
