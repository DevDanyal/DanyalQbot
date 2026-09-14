"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearAdminToken, isLoggedIn, adminGet, adminPost } from "@/lib/admin-api";

interface AppVersion {
  platform: string;
  currentVersion: string;
  minimumVersion: string;
  latestVersion: string | null;
  releaseNotes: string | null;
  updatedAt: number;
}

const PLATFORMS = ["android", "ios", "web"] as const;

export default function SettingsPage() {
  const router = useRouter();
  const [versions, setVersions] = useState<AppVersion[]>([]);
  const [platform, setPlatform] = useState<string>("android");
  const [currentVer, setCurrentVer] = useState("");
  const [minVer, setMinVer] = useState("");
  const [latestVer, setLatestVer] = useState("");
  const [releaseNotes, setReleaseNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const loadVersions = useCallback(async () => {
    if (!isLoggedIn()) { router.replace("/admin/login"); return; }
    try {
      const data = await adminGet<{ ok: boolean; versions: AppVersion[] }>("/api/v1/admin/app-version");
      setVersions(data.versions ?? []);
    } catch { /* */ }
  }, [router]);

  useEffect(() => {
    if (!isLoggedIn()) { router.replace("/admin/login"); return; }
    const t = setTimeout(() => void loadVersions(), 0);
    return () => clearTimeout(t);
  }, [loadVersions, router]);

  const handleLogoutAll = () => {
    clearAdminToken();
    router.replace("/admin/login");
  };

  const upsert = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const body: Record<string, string> = { platform };
      if (currentVer.trim()) body.currentVersion = currentVer.trim();
      if (minVer.trim()) body.minimumVersion = minVer.trim();
      if (latestVer.trim()) body.latestVersion = latestVer.trim();
      if (releaseNotes.trim()) body.releaseNotes = releaseNotes.trim();
      await adminPost("/api/v1/admin/app-version", body);
      setMsg({ ok: true, text: `${platform} version updated.` });
      setCurrentVer("");
      setMinVer("");
      setLatestVer("");
      setReleaseNotes("");
      await loadVersions();
    } catch (e: unknown) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Failed to update." });
    } finally {
      setBusy(false);
    }
  };

  const fmtTs = (ts: number) => ts ? new Date(ts).toLocaleString() : "—";

  return (
    <div className="max-w-2xl space-y-4">
      <div className="rounded-xl border border-white/[.08] bg-[#111827] p-5">
        <h3 className="mb-3 text-sm font-bold text-white">Session</h3>
        <p className="mb-4 text-xs text-gray-400">
          The admin panel uses a server-issued session token stored in your browser. Tokens
          expire automatically after 12 hours. Log out to invalidate it immediately.
        </p>
        <button
          onClick={handleLogoutAll}
          className="rounded-lg bg-[#EF4444] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#EF4444]/80"
        >
          Log out of session
        </button>
      </div>

      <div className="rounded-xl border border-white/[.08] bg-[#111827] p-5">
        <h3 className="mb-3 text-sm font-bold text-white">Security</h3>
        <ul className="space-y-2 text-xs text-gray-400">
          <li>&#8226; Admin access is enforced on the backend — normal user tokens are rejected by every admin API.</li>
          <li>&#8226; Admin login is rate limited (5 attempts / 15 min per IP).</li>
          <li>&#8226; All admin actions are recorded in the security log.</li>
          <li>&#8226; Passwords are never stored or returned in plain text.</li>
          <li>&#8226; License expiry and device limits are validated server-side on every request.</li>
        </ul>
      </div>

      <div className="rounded-xl border border-white/[.08] bg-[#111827] p-5">
        <h3 className="mb-3 text-sm font-bold text-white">Operations</h3>
        <ul className="space-y-2 text-xs text-gray-400">
          <li>&#8226; Review the Security and Activity pages each morning.</li>
          <li>&#8226; Suspend users whose licenses are revoked before resetting their devices.</li>
          <li>&#8226; Use device reset only when a customer legitimately needs a new device.</li>
          <li>&#8226; Keep ADMIN_PASSWORD strong and rotated. Brush up credentials via Vercel env vars.</li>
        </ul>
      </div>

      {/* App Version Management */}
      <div className="rounded-xl border border-white/[.08] bg-[#111827] p-5">
        <h3 className="mb-1 text-sm font-bold text-white">App Version Management</h3>
        <p className="mb-4 text-xs text-gray-400">
          Control which versions are current, minimum-required, and latest for each platform.
          Customers running below the minimum version will be prompted to update.
        </p>

        {msg && (
          <div className={`mb-4 rounded-lg border px-4 py-2.5 text-xs font-semibold ${msg.ok ? "border-[#22C55E]/20 bg-[#22C55E]/10 text-[#22C55E]" : "border-[#EF4444]/20 bg-[#EF4444]/10 text-[#EF4444]"}`}>
            {msg.text}
          </div>
        )}

        <form onSubmit={upsert} className="mb-5 grid gap-3">
          <div className="flex gap-3">
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="rounded-lg border border-white/[.1] bg-white/[.04] px-3 py-2.5 text-sm text-white outline-none focus:border-[#2563EB]/60"
            >
              {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <input
              value={currentVer}
              onChange={(e) => setCurrentVer(e.target.value)}
              placeholder="Current version (e.g. 1.0.0)"
              className="flex-1 rounded-lg border border-white/[.1] bg-white/[.04] px-3 py-2.5 text-sm text-white outline-none focus:border-[#2563EB]/60"
            />
          </div>
          <div className="flex gap-3">
            <input
              value={minVer}
              onChange={(e) => setMinVer(e.target.value)}
              placeholder="Minimum version (e.g. 1.0.0)"
              className="flex-1 rounded-lg border border-white/[.1] bg-white/[.04] px-3 py-2.5 text-sm text-white outline-none focus:border-[#2563EB]/60"
            />
            <input
              value={latestVer}
              onChange={(e) => setLatestVer(e.target.value)}
              placeholder="Latest version (optional)"
              className="flex-1 rounded-lg border border-white/[.1] bg-white/[.04] px-3 py-2.5 text-sm text-white outline-none focus:border-[#2563EB]/60"
            />
          </div>
          <input
            value={releaseNotes}
            onChange={(e) => setReleaseNotes(e.target.value)}
            placeholder="Release notes (optional)"
            className="rounded-lg border border-white/[.1] bg-white/[.04] px-3 py-2.5 text-sm text-white outline-none focus:border-[#2563EB]/60"
          />
          <div>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-gradient-to-r from-[#2563EB] to-[#3B82F6] px-4 py-2 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-50"
            >
              {busy ? "Saving..." : "Update version"}
            </button>
          </div>
        </form>

        {versions.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-white/[.08]">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-white/[.06] text-xs text-gray-400">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Platform</th>
                  <th className="px-4 py-2.5 font-medium">Current</th>
                  <th className="px-4 py-2.5 font-medium">Minimum</th>
                  <th className="px-4 py-2.5 font-medium">Latest</th>
                  <th className="px-4 py-2.5 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {versions.map((v) => (
                  <tr key={v.platform} className="border-b border-white/[.04] last:border-0 hover:bg-white/[.02]">
                    <td className="px-4 py-2.5 text-xs font-semibold text-white capitalize">{v.platform}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-[#22C55E]">{v.currentVersion}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-[#F97316]">{v.minimumVersion}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-400">{v.latestVersion ?? "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs tabular-nums text-gray-500">{fmtTs(v.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}