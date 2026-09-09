"use client";

import { useEffect, useState } from "react";

const KEY = "qx_device_id";

export function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  let id = window.localStorage.getItem(KEY);
  if (!id) {
    id = `DEV-${Math.random().toString(36).slice(2, 10).toUpperCase()}${Date.now()
      .toString(36)
      .slice(-4)
      .toUpperCase()}`;
    window.localStorage.setItem(KEY, id);
  }
  return id;
}

export interface MeResponse {
  authenticated: boolean;
  role?: "customer" | "admin";
  user?: { name: string; userId: string };
}

export function useMe(): {
  loading: boolean;
  me: MeResponse | null;
  refresh: () => void;
} {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = () => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json()) as MeResponse;
        setMe(data);
      })
      .catch(() => setMe({ authenticated: false }))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
  }, []);

  return { loading, me, refresh };
}
