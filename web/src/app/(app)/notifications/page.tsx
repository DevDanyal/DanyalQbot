"use client";

import { useCallback, useEffect, useState } from "react";
import { LoadingPage, ErrorState, EmptyState, Badge } from "@/components/app-ui";

interface Notification {
  id: number;
  type: string;
  title: string;
  body: string | null;
  is_read: boolean;
  created_at: string;
}

const TYPE_BADGE: Record<string, { label: string; variant: "success" | "warning" | "danger" | "primary" | "default" }> = {
  license_expiring: { label: "Expiring", variant: "warning" },
  license_expired: { label: "Expired", variant: "danger" },
  license_suspended: { label: "Suspended", variant: "danger" },
  device_registered: { label: "Device", variant: "primary" },
  security_alert: { label: "Security", variant: "danger" },
  announcement: { label: "Announcement", variant: "primary" },
  system: { label: "System", variant: "default" },
};

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/notifications", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load");
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setNotifications(json.items ?? []);
      setUnread(json.unread ?? 0);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const markRead = async (id: number) => {
    await fetch(`/api/v1/notifications/${id}/read`, { method: "POST" });
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
    setUnread((u) => Math.max(0, u - 1));
  };

  const markAll = async () => {
    await fetch("/api/v1/notifications/read-all", { method: "POST" });
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnread(0);
  };

  if (loading) return <LoadingPage label="Loading notifications..." />;
  if (error) return <ErrorState title="Could not load notifications" detail={error} onRetry={load} />;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white">Notifications</h1>
          <p className="mt-1 text-sm text-soft">
            {unread > 0 ? `${unread} unread notification${unread === 1 ? "" : "s"}` : "You're all caught up"}
          </p>
        </div>
        {unread > 0 ? (
          <button onClick={markAll} className="btn-ghost !px-4 !py-2 text-xs">
            Mark all read
          </button>
        ) : null}
      </div>

      {notifications.length === 0 ? (
        <EmptyState
          icon={
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          }
          title="No notifications yet"
          detail="You'll receive notifications about your license, security events, and announcements."
        />
      ) : (
        <div className="app-card divide-y divide-line overflow-hidden">
          {notifications.map((n) => {
            const badge = TYPE_BADGE[n.type] ?? TYPE_BADGE.system;
            return (
              <div
                key={n.id}
                className={`flex items-start gap-4 px-5 py-4 transition-colors ${
                  !n.is_read ? "bg-primary/[0.03]" : ""
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {!n.is_read && (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                    )}
                    <p className="text-sm font-semibold text-white">{n.title}</p>
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  </div>
                  {n.body ? (
                    <p className="mt-1 text-xs leading-relaxed text-soft">{n.body}</p>
                  ) : null}
                  <p className="mt-2 text-[11px] text-faint">
                    {new Date(n.created_at).toLocaleString()}
                  </p>
                </div>
                {!n.is_read ? (
                  <button
                    onClick={() => markRead(n.id)}
                    className="shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-semibold text-soft hover:bg-white/[0.04] hover:text-white"
                  >
                    Dismiss
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}