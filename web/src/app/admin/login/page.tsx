"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { setAdminToken, isLoggedIn } from "@/lib/admin-api";

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockout, setLockout] = useState<number | null>(null);

  useEffect(() => {
    if (isLoggedIn()) {
      router.replace("/admin/dashboard");
    }
  }, [router]);

  useEffect(() => {
    if (lockout === null) return;
    if (lockout <= 0) {
      const t = setTimeout(() => setLockout(null), 0);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setLockout((s) => (s !== null ? s - 1 : null)), 1000);
    return () => clearTimeout(t);
  }, [lockout]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || lockout !== null) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        if (res.status === 429) {
          const match = data.error?.message?.match(/(\d+)\s*minute/);
          const mins = match ? parseInt(match[1]) * 60 : 900;
          setLockout(mins);
          setError("Too many failed attempts. Please wait.");
        } else {
          setError(data.error?.message ?? "Login failed.");
        }
        return;
      }
      setAdminToken(data.token);
      router.replace("/admin/dashboard");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4" style={{ background: "#0B1020" }}>
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-[#2563EB] to-[#22C55E] shadow-lg shadow-[#2563EB]/20">
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">Admin Panel</h1>
          <p className="mt-1 text-sm text-gray-400">DanyalQBot Management</p>
        </div>

        <form
          onSubmit={submit}
          className="rounded-2xl border border-white/[.08] p-6 shadow-2xl"
          style={{ background: "#111827" }}
        >
          <label className="mb-2 block text-xs font-semibold text-gray-400">Master Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter master password"
            autoComplete="current-password"
            disabled={busy || lockout !== null}
            className="mb-4 w-full rounded-xl border border-white/[.1] bg-white/[.04] px-4 py-3 text-sm text-white placeholder-gray-500 outline-none transition focus:border-[#2563EB]/60 disabled:opacity-50"
          />
          {error && (
            <div className="mb-4 rounded-xl border border-[#EF4444]/25 bg-[#EF4444]/[.07] px-4 py-3 text-xs text-[#EF4444]">
              {error}
            </div>
          )}
          {lockout !== null && (
            <div className="mb-4 text-center text-sm text-gray-400">
              Locked out. Retry in <span className="font-mono text-[#F97316]">{formatTime(lockout)}</span>
            </div>
          )}
          <button
            type="submit"
            disabled={busy || lockout !== null}
            className="w-full rounded-xl bg-gradient-to-r from-[#2563EB] to-[#22C55E] py-3 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
