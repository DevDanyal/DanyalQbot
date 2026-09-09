"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getDeviceId } from "@/lib/client-auth";

export default function LoginPage() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, password, deviceId: getDeviceId() }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.message ?? "Login failed.");
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-4">
      <div className="bg-grid pointer-events-none fixed inset-0 -z-10" aria-hidden />
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-sky to-mint text-ink shadow-[0_4px_18px_rgba(56,189,248,.35)]">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 17l6-6 4 4 8-8" />
              <path d="M15 7h4v4" />
            </svg>
          </div>
          <h1 className="text-xl font-bold tracking-tight">QX Trading</h1>
          <p className="mt-1 text-sm text-soft">Licensed access — enter your credentials</p>
        </div>

        <form
          onSubmit={submit}
          className="rounded-2xl border border-white/[.08] bg-white/[.03] p-6 shadow-2xl"
        >
          <label className="mb-1.5 block text-xs font-semibold text-soft">User ID</label>
          <input
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="DQB-XXXX-XXXX"
            autoCapitalize="characters"
            autoComplete="username"
            className="mb-4 w-full rounded-xl border border-white/[.1] bg-black/20 px-3.5 py-2.5 text-sm outline-none transition focus:border-sky/60"
          />

          <label className="mb-1.5 block text-xs font-semibold text-soft">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            className="mb-4 w-full rounded-xl border border-white/[.1] bg-black/20 px-3.5 py-2.5 text-sm outline-none transition focus:border-sky/60"
          />

          {error ? (
            <p className="mb-4 rounded-xl border border-coral/25 bg-coral/[.07] px-3.5 py-2.5 text-xs text-coral">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-gradient-to-r from-sky to-mint py-2.5 text-sm font-bold text-ink transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Signing in…" : "Login"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-faint">
          One license per device · Access expires on your plan end date
        </p>
      </div>
    </div>
  );
}
