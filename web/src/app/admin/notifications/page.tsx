"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { adminGet, adminPost, isLoggedIn } from "@/lib/admin-api";

interface AdminNotification {
  id: number;
  customer_id: number | null;
  type: string;
  title: string;
  body: string | null;
  is_read: boolean;
  created_at: number;
}

function fmtTs(ts: number): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

const typeStyle: Record<string, string> = {
  license_expiring: "bg-[#F97316]/10 text-[#F97316]",
  license_expired: "bg-[#EF4444]/10 text-[#EF4444]",
  license_suspended: "bg-[#EF4444]/10 text-[#EF4444]",
  device_registered: "bg-[#2563EB]/10 text-[#2563EB]",
  security_alert: "bg-[#EF4444]/10 text-[#EF4444]",
  announcement: "bg-[#22C55E]/10 text-[#22C55E]",
  system: "bg-white/[.08] text-gray-400",
};

export default function AdminNotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(100);

  // Broadcast form
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!isLoggedIn()) { router.replace("/admin/login"); return; }
    try {
      const data = await adminGet<{ ok: boolean; notifications: AdminNotification[] }>(
        `/api/v1/admin/notifications?limit=${limit}`
      );
      setNotifications(data.notifications ?? []);
    } catch { /* */ }
    setLoading(false);
  }, [router, limit]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const broadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const data = await adminPost<{ ok: boolean; announcedTo: number }>("/api/v1/admin/notifications", { title, body });
      setMsg({ ok: true, text: `Announcement sent to ${data.announcedTo} active customer(s).` });
      setTitle("");
      setBody("");
      await load();
    } catch (e: unknown) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Failed to send." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Broadcast form */}
      <div className="rounded-xl border border-white/[.08] bg-[#111827] p-5">
        <h3 className="mb-1 text-sm font-bold text-white">Broadcast announcement</h3>
        <p className="mb-4 text-xs text-gray-400">
          Sends a notification to every active customer. This is immediate and not
          de-duplicated — use sparingly for important announcements.
        </p>
        {msg && (
          <div className={`mb-4 rounded-lg border px-4 py-2.5 text-xs font-semibold ${msg.ok ? "border-[#22C55E]/20 bg-[#22C55E]/10 text-[#22C55E]" : "border-[#EF4444]/20 bg-[#EF4444]/10 text-[#EF4444]"}`}>
            {msg.text}
          </div>
        )}
        <form onSubmit={broadcast} className="grid gap-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Announcement title (max 200 chars)"
            maxLength={200}
            className="rounded-lg border border-white/[.1] bg-white/[.04] px-3 py-2.5 text-sm text-white outline-none focus:border-[#2563EB]/60"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Message body (optional)"
            rows={3}
            className="rounded-lg border border-white/[.1] bg-white/[.04] px-3 py-2.5 text-sm text-white outline-none focus:border-[#2563EB]/60"
          />
          <div>
            <button
              type="submit"
              disabled={busy || !title.trim()}
              className="rounded-lg bg-gradient-to-r from-[#2563EB] to-[#3B82F6] px-4 py-2 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-50"
            >
              {busy ? "Sending..." : "Send announcement"}
            </button>
          </div>
        </form>
      </div>

      {/* Notifications list */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs text-gray-500">
            {loading ? "Loading..." : `${notifications.length} recent notifications`}
          </p>
          <div className="flex items-center gap-2">
            <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="rounded-lg border border-white/[.1] bg-white/[.04] px-3 py-1.5 text-xs text-white outline-none focus:border-[#2563EB]/60">
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
            <button onClick={() => load()} className="rounded-lg border border-white/[.1] px-3 py-1.5 text-xs text-gray-400 hover:text-white">
              Refresh
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-white/[.08] bg-[#111827]">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-white/[.06] text-xs text-gray-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Title</th>
                  <th className="px-4 py-3 font-medium">Body</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Read</th>
                  <th className="px-4 py-3 font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {notifications.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">No notifications yet</td></tr>
                ) : notifications.map((n) => (
                  <tr key={n.id} className="border-b border-white/[.04] last:border-0 hover:bg-white/[.02]">
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${typeStyle[n.type] ?? typeStyle.system}`}>
                        {n.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs font-semibold text-white">{n.title}</td>
                    <td className="max-w-[240px] truncate px-4 py-3 text-xs text-gray-300">{n.body ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{n.customer_id ?? "all"}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${n.is_read ? "bg-white/[.06] text-gray-400" : "bg-[#2563EB]/10 text-[#2563EB]"}`}>
                        {n.is_read ? "read" : "unread"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs tabular-nums text-gray-500">{fmtTs(n.created_at)}</td>
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