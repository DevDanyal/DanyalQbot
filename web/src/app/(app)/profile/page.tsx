"use client";

import { useCallback, useEffect, useState } from "react";
import { useMe } from "@/lib/client-auth";
import { LoadingPage, ErrorState, SectionCard, StatusDot } from "@/components/app-ui";

interface ProfileData {
  user_id: string;
  name: string;
  status: string;
  planCode: string;
  registeredDevices: number;
  totalActivity: number;
}

export default function ProfilePage() {
  const { me } = useMe();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/account", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load profile");
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setProfile({
        user_id: json.customer.userId,
        name: json.customer.name,
        status: json.customer.status,
        planCode: json.customer.planCode,
        registeredDevices: json.devices?.length ?? 0,
        totalActivity: 0,
      });
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

  if (loading) return <LoadingPage label="Loading profile..." />;
  if (error) return <ErrorState title="Could not load profile" detail={error} onRetry={load} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-white">Profile</h1>
        <p className="mt-1 text-sm text-soft">Your account details and activity summary.</p>
      </div>

      <div className="app-card flex items-center gap-5 p-6">
        <div className="grid size-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary/20 to-success/10 text-2xl font-bold text-primary">
          {profile?.name?.charAt(0)?.toUpperCase() ?? "?"}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h2 className="truncate text-lg font-bold text-white">{profile?.name}</h2>
            <div className="flex items-center gap-2">
              <StatusDot status={profile?.status === "active" ? "active" : "danger"} />
              <span className="text-xs capitalize text-soft">{profile?.status}</span>
            </div>
          </div>
          <p className="mt-0.5 text-sm text-soft">{me?.user?.userId}</p>
        </div>
      </div>

      <SectionCard title="Account Details" description="Your account information">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs text-soft">User ID</p>
            <p className="mt-1 font-mono text-sm text-white">{profile?.user_id}</p>
          </div>
          <div>
            <p className="text-xs text-soft">Plan</p>
            <p className="mt-1 text-sm font-semibold text-white">{profile?.planCode ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-soft">Registered devices</p>
            <p className="mt-1 text-sm font-semibold text-white">{profile?.registeredDevices ?? 0}</p>
          </div>
          <div>
            <p className="text-xs text-soft">Account status</p>
            <div className="mt-1 flex items-center gap-2">
              <StatusDot status={profile?.status === "active" ? "active" : "danger"} />
              <p className="text-sm font-semibold capitalize text-white">{profile?.status}</p>
            </div>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}