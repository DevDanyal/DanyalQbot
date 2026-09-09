"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface AdminCustomer {
  id: number;
  userId: string;
  name: string;
  status: string;
  effectiveStatus: string;
  expiresAt: Date | string | null;
  deviceId: string | null;
  createdAt: Date | string;
  lastLogin: Date | string | null;
}

function fmtDate(d: Date | string | null): string {
  if (!d) return "—";
  const t = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(t.getTime())) return "—";
  return t.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function AdminPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [days, setDays] = useState(30);
  const [createMsg, setCreateMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    type Res = { ok?: boolean; customers?: AdminCustomer[]; message?: string };
    try {
      const res = await fetch("/api/admin/customers", { cache: "no-store" });
      if (res.status === 401) {
        router.replace("/admin/login");
        return;
      }
      const data = (await res.json()) as Res;
      if (data.ok && data.customers) {
        setCustomers(data.customers);
        setErr(null);
      } else {
        setErr(data.message ?? "Failed to load");
      }
    } catch {
      setCustomers([]);
      setErr("Failed to load customers");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const t = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(t);
  }, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateMsg(null);
    try {
      const res = await fetch("/api/admin/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, userId, password, days }),
      });
      const data = await res.json();
      if (data.ok) {
        setCreateMsg({ ok: true, text: `Created ${data.customer.userId}` });
        setName("");
        setUserId("");
        setPassword("");
        await load();
      } else {
        setCreateMsg({ ok: false, text: data.message ?? "Creation failed" });
      }
    } catch {
      setCreateMsg({ ok: false, text: "Network error" });
    }
  };

  const act = async (id: number, action: string, days?: number) => {
    try {
      await fetch(`/api/admin/customers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, days }),
      });
      await load();
    } catch {
      /* ignore */
    }
  };

  const active = customers.filter((c) => c.effectiveStatus === "active").length;
  const expired = customers.filter((c) => c.effectiveStatus === "expired").length;
  const suspended = customers.filter((c) => c.status === "suspended" || c.status === "revoked").length;

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-soft">Loading…</div>;
  }

  if (err) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl border border-coral/25 bg-coral/[.07] px-5 py-4 text-sm text-coral">
          {err}
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen">
      <div className="bg-grid pointer-events-none fixed inset-0 -z-10" aria-hidden />
      <div className="mx-auto w-full max-w-6xl px-4 pt-8 sm:px-6 lg:px-8">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight">DanyalQBot · License Manager</h1>
            <p className="text-sm text-soft">Create and manage customer access</p>
          </div>
          <button
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              router.replace("/admin/login");
            }}
            className="rounded-lg border border-white/[.1] px-3 py-1.5 text-xs font-semibold text-soft hover:text-foreground"
          >
            Log out
          </button>
        </header>

        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: "Total", value: customers.length, cls: "text-foreground" },
            { label: "Active", value: active, cls: "text-mint" },
            { label: "Expired", value: expired, cls: "text-amber" },
            { label: "Suspended", value: suspended, cls: "text-coral" },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border border-white/[.08] bg-white/[.03] p-4">
              <p className="text-xs text-soft">{s.label}</p>
              <p className={`mt-1 text-2xl font-bold tabular-nums ${s.cls}`}>{s.value}</p>
            </div>
          ))}
        </div>

        <div className="mb-8 rounded-2xl border border-white/[.08] bg-white/[.03] p-5">
          <h2 className="mb-4 text-sm font-bold">Create license</h2>
          <form onSubmit={create} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Customer name" required className="rounded-xl border border-white/[.1] bg-black/20 px-3.5 py-2.5 text-sm outline-none focus:border-sky/60" />
            <input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="User ID (auto-upper)" required className="rounded-xl border border-white/[.1] bg-black/20 px-3.5 py-2.5 text-sm outline-none focus:border-sky/60" />
            <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password (6+ chars)" required className="rounded-xl border border-white/[.1] bg-black/20 px-3.5 py-2.5 text-sm outline-none focus:border-sky/60" />
            <input type="number" min={1} value={days} onChange={(e) => setDays(Number(e.target.value))} placeholder="Days" className="rounded-xl border border-white/[.1] bg-black/20 px-3.5 py-2.5 text-sm outline-none focus:border-sky/60" />
            <button type="submit" className="rounded-xl bg-gradient-to-r from-sky to-mint py-2.5 text-sm font-bold text-ink transition hover:opacity-90">
              Create
            </button>
          </form>
          {createMsg ? (
            <p className={`mt-3 text-xs ${createMsg.ok ? "text-mint" : "text-coral"}`}>{createMsg.text}</p>
          ) : null}
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/[.08] bg-white/[.03]">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-white/[.08] text-xs uppercase tracking-wide text-soft">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">User ID</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Expires</th>
                <th className="px-4 py-3">Device</th>
                <th className="px-4 py-3">Last login</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {customers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-soft">
                    No customers yet. Create your first license above.
                  </td>
                </tr>
              ) : (
                customers.map((c) => {
                  const displayStatus = c.effectiveStatus;
                  return (
                    <tr key={c.id} className="border-b border-white/[.05] last:border-0">
                      <td className="px-4 py-3 font-medium">{c.name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-sky">{c.userId}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            displayStatus === "active"
                              ? "bg-mint/10 text-mint"
                              : displayStatus === "expired"
                                ? "bg-amber/10 text-amber"
                                : "bg-coral/10 text-coral"
                          }`}
                        >
                          {displayStatus}
                        </span>
                      </td>
                      <td className="px-4 py-3 tabular-nums">{fmtDate(c.expiresAt)}</td>
                      <td className="px-4 py-3 font-mono text-xs text-faint">{c.deviceId ?? "—"}</td>
                      <td className="px-4 py-3 tabular-nums text-faint">{fmtDate(c.lastLogin)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2 text-xs">
                          {c.status === "active" ? (
                            <>
                              <button onClick={() => act(c.id, "suspended")} className="rounded-lg border border-white/[.1] px-2 py-1 text-soft hover:text-amber">Suspend</button>
                              <button onClick={() => act(c.id, "revoked")} className="rounded-lg border border-coral/30 px-2 py-1 text-coral">Revoke</button>
                            </>
                          ) : (
                            <button onClick={() => act(c.id, "active")} className="rounded-lg border border-white/[.1] px-2 py-1 text-mint">Activate</button>
                          )}
                          <button onClick={() => act(c.id, "extend", 30)} className="rounded-lg border border-white/[.1] px-2 py-1 text-sky">+30d</button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
