"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SectionCard } from "@/components/app-ui";

export default function SettingsPage() {
  const router = useRouter();

  /* ── Change password state ── */
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  const changePassword = async () => {
    setPwError(null);
    setPwSuccess(false);
    if (!pwCurrent || !pwNew) {
      setPwError("Please fill in all fields");
      return;
    }
    if (pwNew.length < 8) {
      setPwError("New password must be at least 8 characters");
      return;
    }
    if (pwNew !== pwConfirm) {
      setPwError("Passwords do not match");
      return;
    }
    setPwLoading(true);
    try {
      const res = await fetch("/api/v1/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: pwCurrent, newPassword: pwNew }),
      });
      const json = await res.json();
      if (json.ok) {
        setPwSuccess(true);
        setPwCurrent("");
        setPwNew("");
        setPwConfirm("");
      } else {
        setPwError(json.error ?? "Failed to change password");
      }
    } catch {
      setPwError("Network error");
    } finally {
      setPwLoading(false);
    }
  };

  /* ── Logout all ── */
  const [logoutLoading, setLogoutLoading] = useState(false);
  const logoutAll = async () => {
    setLogoutLoading(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.replace("/login");
      router.refresh();
    } finally {
      setLogoutLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-white">Settings</h1>
        <p className="mt-1 text-sm text-soft">Manage your account settings and security.</p>
      </div>

      {/* Change password */}
      <SectionCard title="Change Password" description="Update your account password">
        <div className="space-y-4">
          {pwSuccess && (
            <div className="rounded-xl border border-success/20 bg-success/10 px-4 py-3 text-sm font-semibold text-success">
              Password changed successfully.
            </div>
          )}
          {pwError && (
            <div className="rounded-xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">
              {pwError}
            </div>
          )}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-soft">Current password</label>
            <input
              type="password"
              value={pwCurrent}
              onChange={(e) => setPwCurrent(e.target.value)}
              className="app-input"
              placeholder="Enter current password"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-soft">New password</label>
            <input
              type="password"
              value={pwNew}
              onChange={(e) => setPwNew(e.target.value)}
              className="app-input"
              placeholder="At least 8 characters"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-soft">Confirm new password</label>
            <input
              type="password"
              value={pwConfirm}
              onChange={(e) => setPwConfirm(e.target.value)}
              className="app-input"
              placeholder="Repeat new password"
            />
          </div>
          <button
            onClick={changePassword}
            disabled={pwLoading}
            className="btn-primary !px-6"
          >
            {pwLoading ? "Changing..." : "Change password"}
          </button>
        </div>
      </SectionCard>

      {/* Account actions */}
      <SectionCard title="Account Actions" description="Manage your sessions and account">
        <div className="space-y-3">
          <button
            onClick={logoutAll}
            disabled={logoutLoading}
            className="btn-danger !px-6"
          >
            {logoutLoading ? "Logging out..." : "Log out of all devices"}
          </button>
          <p className="text-xs text-soft">
            This will end all active sessions and require you to log in again.
          </p>
        </div>
      </SectionCard>
    </div>
  );
}