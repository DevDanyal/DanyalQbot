"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getStatus } from "@/lib/api";
import { fmtMoney } from "@/lib/format";
import { StatusDot } from "@/components/app-ui";
import type { BotStatus } from "@/lib/types";

/* ── Icons ────────────────────────────────────────────────── */

const Ic = {
  home: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h5v-6h4v6h5V9.5" /></svg>
  ),
  qbot: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="5" y="8" width="14" height="11" rx="2" /><circle cx="12" cy="13" r="1.6" /><path d="M12 8V4.5" /><path d="M9 2h6" /></svg>
  ),
  history: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 7v5l3 2" /><circle cx="12" cy="12" r="9" /></svg>
  ),
  license: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" /><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" /></svg>
  ),
  bell: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
  ),
  profile: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
  ),
  support: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
  ),
  menu: (<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" /></svg>),
  logout: (<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>),
};

const NAV = [
  { label: "Home", href: "/", icon: Ic.home },
  { label: "QBot", href: "/qbot", icon: Ic.qbot },
  { label: "History", href: "/history", icon: Ic.history },
  { label: "License", href: "/license", icon: Ic.license },
  { label: "Notifications", href: "/notifications", icon: Ic.bell },
  { label: "Profile", href: "/profile", icon: Ic.profile },
  { label: "Settings", href: "/settings", icon: Ic.settings },
  { label: "Support", href: "/support", icon: Ic.support },
] as const;

const BOTTOM_NAV = ["/", "/qbot", "/history", "/license", "/notifications"] as const;

function isActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/" || pathname === "";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [unread, setUnread] = useState(0);
  const [status, setStatus] = useState<BotStatus | null>(null);
  const [offline, setOffline] = useState(false);

  const loadUnread = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/account", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data.ok) setUnread(data.notificationsUnread ?? 0);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void loadUnread(), 0);
    return () => clearTimeout(t);
  }, [pathname, loadUnread]);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      const s = await getStatus().catch(() => null);
      if (cancelled) return;
      if (!s) {
        setOffline(true);
        setStatus(null);
      } else {
        setOffline(false);
        setStatus(s);
      }
    };
    void poll();
    const interval = setInterval(() => void poll(), 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  };

  const running = !!status?.running;
  const botState = offline ? "offline" : running ? "running" : status?.error ? "error" : "idle";

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col lg:flex-row">
      {/* ── Desktop sidebar ── */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-surface-2 lg:flex">
        <div className="flex h-16 items-center gap-3 border-b border-line px-5">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-[#22c55e] text-white shadow-[0_4px_18px_rgba(37,99,235,.35)]">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h4v4" /></svg>
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-white">Danyal QBot</p>
            <p className="text-[11px] text-soft">Trading platform</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {NAV.map((item) => {
            const active = isActive(item.href, pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`mb-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-primary-soft text-primary"
                    : "text-soft hover:bg-white/[0.04] hover:text-white"
                }`}
              >
                <span className={active ? "text-primary" : ""}>{item.icon}</span>
                <span className="flex-1">{item.label}</span>
                {item.href === "/notifications" && unread > 0 ? (
                  <span className="grid min-w-5 place-items-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {unread > 99 ? "99+" : unread}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-line p-3">
          <button
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-soft transition-colors hover:bg-danger/10 hover:text-danger"
          >
            {Ic.logout}
            Log out
          </button>
        </div>
      </aside>

      {/* ── Main column ── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-surface/80 px-4 backdrop-blur-md lg:px-6">
          <div className="flex items-center gap-3 lg:hidden">
            <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-[#22c55e] text-white">
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h4v4" /></svg>
            </div>
            <p className="text-sm font-bold text-white lg:hidden">Danyal QBot</p>
          </div>

          <div className="hidden lg:block">
            <p className="text-sm font-bold capitalize text-white">
              {NAV.find((n) => isActive(n.href, pathname))?.label ?? "Home"}
            </p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-full border border-line bg-white/[0.03] px-3 py-1.5 text-xs">
              <StatusDot status={running ? "active" : offline ? "danger" : status?.error ? "danger" : "idle"} pulse={running} />
              <span className="capitalize text-soft">{botState}</span>
            </div>
            <div className="hidden items-center gap-2 rounded-full border border-line bg-white/[0.03] px-3 py-1.5 text-xs sm:flex">
              <span className="text-soft">Balance</span>
              <span className="font-semibold tabular-nums text-white">
                {status?.balance != null ? fmtMoney(status.balance) : "—"}
              </span>
            </div>
            <Link
              href="/notifications"
              className="relative grid size-9 place-items-center rounded-xl border border-line bg-white/[0.03] text-soft hover:text-white lg:hidden"
              aria-label="Notifications"
            >
              {Ic.bell}
              {unread > 0 ? (
                <span className="absolute -right-1 -top-1 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[9px] font-bold text-white">
                  {unread > 9 ? "9+" : unread}
                </span>
              ) : null}
            </Link>
          </div>
        </header>

        <main className="flex-1 px-4 pb-24 pt-5 sm:px-6 lg:px-8 lg:pb-10">
          {children}
        </main>
      </div>

      {/* ── Mobile bottom nav ── */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-line bg-surface-2/95 backdrop-blur-md lg:hidden">
        <div className="mx-auto flex max-w-lg items-stretch justify-around px-2 py-1.5">
          {BOTTOM_NAV.map((href) => {
            const item = NAV.find((n) => n.href === href)!;
            const active = isActive(href, pathname);
            return (
              <Link
                key={href}
                href={href}
                className={`relative flex flex-1 flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-[10px] font-semibold transition-colors ${
                  active ? "text-primary" : "text-faint hover:text-soft"
                }`}
              >
                {item.icon}
                {item.label}
                {href === "/notifications" && unread > 0 ? (
                  <span className="absolute right-1 top-0 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[9px] font-bold text-white">
                    {unread > 9 ? "9+" : unread}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}