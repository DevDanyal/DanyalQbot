"use client";

import { useEffect, useState } from "react";
import { Badge, StatusDot, LoadingPage, ErrorState } from "@/components/app-ui";

interface AccountData {
  customer: {
    userId: string;
    name: string;
    email: string;
    status: string;
    planCode: string;
    expiresAt: number | null;
  };
  devices: Array<{ id: number; platform: string; label: string; lastSeenAt: number | null; isCurrent: boolean }>;
  notificationsUnread: number;
}

function timeRemaining(expiresAt: number | null): string {
  if (!expiresAt) return "No expiry";
  const diff = expiresAt - Date.now();
  if (diff <= 0) return "Expired";
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  if (days > 0) return `${days}d ${hours}h remaining`;
  const minutes = Math.floor((diff % 3600000) / 60000);
  return `${hours}h ${minutes}m remaining`;
}

export default function LicensePage() {
  const [data, setData] = useState<AccountData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [expiringSoon, setExpiringSoon] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/account", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load account");
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setData(json);
      const expiresAt = json.customer?.expiresAt ?? null;
      const now = Date.now();
      setExpired(expiresAt != null && expiresAt < now);
      setExpiringSoon(
        expiresAt != null && expiresAt >= now && expiresAt - now < 3 * 86400000
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, []);

  if (loading) return <LoadingPage label="Loading license..." />;
  if (error) return <ErrorState title="Could not load license" detail={error} onRetry={load} />;

  const customer = data?.customer;
  if (!customer) return <ErrorState title="No account data" />;

  const statusBadge = expired
    ? "danger"
    : customer.status === "suspended"
    ? "warning"
    : expiringSoon
    ? "warning"
    : "success";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-white">License & Devices</h1>
        <p className="mt-1 text-sm text-soft">Your license status and registered devices.</p>
      </div>

      {/* License card */}
      <div className="app-card p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-soft">License</p>
            <div className="mt-2 flex items-center gap-3">
              <StatusDot status={expired ? "danger" : expiringSoon ? "warning" : "active"} size="md" />
              <p className="text-lg font-bold capitalize text-white">{customer.planCode}</p>
              <Badge variant={statusBadge}>{customer.status}</Badge>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs text-soft">Account</p>
            <p className="mt-1 text-sm font-semibold text-white">{customer.userId}</p>
          </div>
          <div>
            <p className="text-xs text-soft">Expires</p>
            <p className={`mt-1 text-sm font-semibold ${expired ? "text-danger" : expiringSoon ? "text-warning" : "text-white"}`}>
              {customer.expiresAt
                ? new Date(customer.expiresAt).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })
                : "Never"}
            </p>
            <p className="text-xs text-soft">{timeRemaining(customer.expiresAt)}</p>
          </div>
        </div>
      </div>

      {/* Devices */}
      <div className="app-card overflow-hidden">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-sm font-bold text-white">Registered Devices</h2>
          <p className="mt-0.5 text-xs text-soft">{data?.devices?.length ?? 0} device(s)</p>
        </div>
        <div className="divide-y divide-line">
          {data?.devices?.map((d) => (
            <div key={d.id} className="flex items-center gap-4 px-5 py-4">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/[0.04] text-soft">
                {d.platform === "android" ? "🤖" : d.platform === "ios" ? "🍎" : "💻"}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold text-white">{d.label || "Unnamed device"}</p>
                  {d.isCurrent && <Badge variant="primary">This device</Badge>}
                </div>
                <p className="mt-0.5 text-xs text-soft capitalize">{d.platform}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-soft">
                  {d.lastSeenAt
                    ? `Last seen ${new Date(d.lastSeenAt).toLocaleDateString()}`
                    : "Never seen"}
                </p>
              </div>
            </div>
          ))}
          {(!data?.devices || data.devices.length === 0) ? (
            <div className="px-5 py-8 text-center text-sm text-soft">No registered devices</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}