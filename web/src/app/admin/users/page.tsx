"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { adminGet, adminPost, adminPatch, isLoggedIn } from "@/lib/admin-api";

interface UserLicense {
  licenseId: string;
  status: string;
  plan: { code: string; name: string } | null;
  startAt: number | null;
  expiresAt: number | null;
}

interface User {
  id: number;
  userId: string;
  name: string;
  status: string;
  effectiveStatus: string;
  expiresAt: string | null;
  createdAt: string;
  lastLogin: string | null;
  license: UserLicense | null;
  licenseStatus: string | null;
}

interface UserDetail {
  user: { id: number; userId: string; name: string; status: string; createdAt: number; lastLogin: number | null; lastIp: string | null };
  license: { licenseId: string; rawStatus: string; plan: { code: string; name: string } | null; expiresAt: number | null } | null;
  devices: { id: number; label: string | null; platform: string | null; isActive: boolean; firstSeenAt: number; lastSeenAt: number }[];
  activeSessions: number;
  recentSecurityLogs: { id: number; action: string; detail: string | null; created_at: number }[];
  recentActivityLogs: { id: number; action: string; detail: string | null; created_at: number }[];
}

function fmtTs(ts: string | number | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function statusBadge(status: string) {
  const s = status.toLowerCase();
  if (s === "active") return "bg-[#22C55E]/10 text-[#22C55E]";
  if (s === "expired") return "bg-[#F97316]/10 text-[#F97316]";
  if (s === "suspended" || s === "revoked") return "bg-[#EF4444]/10 text-[#EF4444]";
  return "bg-gray-500/10 text-gray-400";
}

export default function UsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [detailUser, setDetailUser] = useState<UserDetail | null>(null);
  const [createForm, setCreateForm] = useState({ name: "", userId: "", password: "", planCode: "PRO", days: 30 });
  const [createMsg, setCreateMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [actionBusy, setActionBusy] = useState<number | null>(null);
  const [resetPwId, setResetPwId] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const load = useCallback(async () => {
    if (!isLoggedIn()) { router.replace("/admin/login"); return; }
    try {
      const data = await adminGet<{ ok: boolean; users: User[] }>("/api/v1/admin/users");
      setUsers(data.users ?? []);
    } catch { /* */ }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    return u.name.toLowerCase().includes(q) || u.userId.toLowerCase().includes(q);
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateMsg(null);
    try {
      await adminPost("/api/v1/admin/users", createForm);
      setCreateMsg({ ok: true, text: `Created ${createForm.userId}` });
      setCreateForm({ name: "", userId: "", password: "", planCode: "PRO", days: 30 });
      setShowCreate(false);
      await load();
    } catch (err) {
      setCreateMsg({ ok: false, text: err instanceof Error ? err.message : "Failed" });
    }
  };

  const act = async (id: number, action: string, extra?: Record<string, unknown>) => {
    setActionBusy(id);
    try {
      await adminPatch(`/api/v1/admin/users/${id}`, { action, ...extra });
      await load();
    } catch { /* */ }
    setActionBusy(null);
  };

  const handleResetPassword = async (id: number) => {
    if (newPassword.length < 6) return;
    await act(id, "reset_password", { password: newPassword });
    setResetPwId(null);
    setNewPassword("");
  };

  const loadDetail = async (id: number) => {
    try {
      const data = await adminGet<{ ok: boolean } & UserDetail>(`/api/v1/admin/users/${id}`);
      setDetailUser(data as unknown as UserDetail);
    } catch { /* */ }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-[#2563EB] border-t-transparent" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          type="text"
          placeholder="Search by name or user ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-sm rounded-lg border border-white/[.1] bg-white/[.04] px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-[#2563EB]/60 sm:w-72"
        />
        <button
          onClick={() => { setShowCreate(!showCreate); setCreateMsg(null); }}
          className="rounded-lg bg-[#2563EB] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#2563EB]/80"
        >
          {showCreate ? "Cancel" : "+ Create User"}
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <form onSubmit={handleCreate} className="rounded-xl border border-white/[.08] bg-[#111827] p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <input placeholder="Name" required value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} className="rounded-lg border border-white/[.1] bg-white/[.04] px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-[#2563EB]/60" />
            <input placeholder="User ID" required value={createForm.userId} onChange={(e) => setCreateForm({ ...createForm, userId: e.target.value.toUpperCase() })} className="rounded-lg border border-white/[.1] bg-white/[.04] px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-[#2563EB]/60" />
            <input placeholder="Password (6+)" type="password" required value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} className="rounded-lg border border-white/[.1] bg-white/[.04] px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-[#2563EB]/60" />
            <select value={createForm.planCode} onChange={(e) => setCreateForm({ ...createForm, planCode: e.target.value })} className="rounded-lg border border-white/[.1] bg-white/[.04] px-3 py-2 text-sm text-white outline-none focus:border-[#2563EB]/60">
              <option value="FREE">Free</option>
              <option value="PRO">Pro</option>
              <option value="PREMIUM">Premium</option>
              <option value="YEARLY">Yearly</option>
            </select>
            <button type="submit" className="rounded-lg bg-[#22C55E] py-2 text-sm font-bold text-white transition hover:bg-[#22C55E]/80">Create</button>
          </div>
          {createMsg && <p className={`mt-3 text-xs ${createMsg.ok ? "text-[#22C55E]" : "text-[#EF4444]"}`}>{createMsg.text}</p>}
        </form>
      )}

      {/* Users table */}
      <div className="overflow-hidden rounded-xl border border-white/[.08] bg-[#111827]">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-white/[.06] text-xs text-gray-400">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">User ID</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">Expires</th>
                <th className="px-4 py-3 font-medium">Last Login</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">No users found</td></tr>
              ) : filtered.map((u) => (
                <tr key={u.id} className="border-b border-white/[.04] last:border-0 hover:bg-white/[.02]">
                  <td className="px-4 py-3 font-medium text-white">{u.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-[#2563EB]">{u.userId}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusBadge(u.effectiveStatus)}`}>{u.effectiveStatus}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-300">{u.license?.plan?.code ?? "—"}</td>
                  <td className="px-4 py-3 text-xs tabular-nums text-gray-400">{fmtTs(u.expiresAt)}</td>
                  <td className="px-4 py-3 text-xs tabular-nums text-gray-500">{fmtTs(u.lastLogin)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5 text-xs">
                      <button onClick={() => loadDetail(u.id)} className="rounded-lg border border-white/[.1] px-2 py-1 text-gray-400 hover:text-white">View</button>
                      {u.effectiveStatus === "active" ? (
                        <button onClick={() => act(u.id, "suspend")} disabled={actionBusy === u.id} className="rounded-lg border border-[#F97316]/30 px-2 py-1 text-[#F97316] hover:bg-[#F97316]/10">Suspend</button>
                      ) : (
                        <button onClick={() => act(u.id, "activate")} disabled={actionBusy === u.id} className="rounded-lg border border-[#22C55E]/30 px-2 py-1 text-[#22C55E] hover:bg-[#22C55E]/10">Activate</button>
                      )}
                      <button onClick={() => { setResetPwId(u.id); setNewPassword(""); }} className="rounded-lg border border-white/[.1] px-2 py-1 text-gray-400 hover:text-white">Reset PW</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reset password modal */}
      {resetPwId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setResetPwId(null)}>
          <div className="w-full max-w-sm rounded-xl border border-white/[.1] bg-[#111827] p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 text-sm font-bold text-white">Reset Password</h3>
            <input
              type="password"
              placeholder="New password (6+ chars)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="mb-3 w-full rounded-lg border border-white/[.1] bg-white/[.04] px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-[#2563EB]/60"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setResetPwId(null)} className="rounded-lg px-3 py-1.5 text-xs text-gray-400 hover:text-white">Cancel</button>
              <button onClick={() => handleResetPassword(resetPwId)} disabled={newPassword.length < 6} className="rounded-lg bg-[#EF4444] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">Reset</button>
            </div>
          </div>
        </div>
      )}

      {/* User detail modal */}
      {detailUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setDetailUser(null)}>
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-white/[.1] bg-[#111827] p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">{detailUser.user.name} ({detailUser.user.userId})</h3>
              <button onClick={() => setDetailUser(null)} className="text-gray-400 hover:text-white">&times;</button>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg bg-white/[.03] p-3">
                <p className="text-gray-500">Status</p>
                <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${statusBadge(detailUser.user.status)}`}>{detailUser.user.status}</span>
              </div>
              <div className="rounded-lg bg-white/[.03] p-3">
                <p className="text-gray-500">Active Sessions</p>
                <p className="mt-1 text-sm font-bold text-white">{detailUser.activeSessions}</p>
              </div>
              <div className="rounded-lg bg-white/[.03] p-3">
                <p className="text-gray-500">License</p>
                <p className="mt-1 text-sm font-mono text-[#2563EB]">{detailUser.license?.licenseId ?? "None"}</p>
              </div>
              <div className="rounded-lg bg-white/[.03] p-3">
                <p className="text-gray-500">Plan</p>
                <p className="mt-1 text-sm text-white">{detailUser.license?.plan?.name ?? "—"}</p>
              </div>
              <div className="rounded-lg bg-white/[.03] p-3">
                <p className="text-gray-500">Devices</p>
                <p className="mt-1 text-sm font-bold text-white">{detailUser.devices.length}</p>
              </div>
              <div className="rounded-lg bg-white/[.03] p-3">
                <p className="text-gray-500">Last IP</p>
                <p className="mt-1 font-mono text-sm text-gray-300">{detailUser.user.lastIp ?? "—"}</p>
              </div>
            </div>

            {detailUser.devices.length > 0 && (
              <div className="mb-4">
                <h4 className="mb-2 text-xs font-bold text-gray-400">Devices</h4>
                {detailUser.devices.map((d) => (
                  <div key={d.id} className="flex items-center justify-between rounded-lg bg-white/[.03] px-3 py-2 text-xs">
                    <span className="text-white">{d.label ?? d.platform ?? `Device #${d.id}`}</span>
                    <span className={d.isActive ? "text-[#22C55E]" : "text-[#EF4444]"}>{d.isActive ? "Active" : "Inactive"}</span>
                  </div>
                ))}
              </div>
            )}

            {detailUser.recentSecurityLogs.length > 0 && (
              <div>
                <h4 className="mb-2 text-xs font-bold text-gray-400">Recent Security Events</h4>
                {detailUser.recentSecurityLogs.slice(0, 5).map((log) => (
                  <div key={log.id} className="flex items-center justify-between border-b border-white/[.04] py-1.5 text-xs last:border-0">
                    <span className="text-gray-300">{log.action}</span>
                    <span className="text-gray-500">{fmtTs(log.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
