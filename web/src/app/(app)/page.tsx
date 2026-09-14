"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useMe } from "@/lib/client-auth";
import { getStatus, getStats, botAction } from "@/lib/api";
import { fmtMoney, fmtSigned, fmtUptime } from "@/lib/format";
import { StatusDot, StatCard, Badge } from "@/components/app-ui";
import type { BotStatus, Stats } from "@/lib/types";

export default function HomePage() {
  const { me } = useMe();
  const [status, setStatus] = useState<BotStatus | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [toggling, setToggling] = useState(false);
  const [offline, setOffline] = useState(false);

  const load = useCallback(async () => {
    const [s, st] = await Promise.allSettled([getStatus(), getStats()]);
    setOffline(s.status === "rejected");
    setStatus(s.status === "fulfilled" ? s.value : null);
    setStats(st.status === "fulfilled" ? st.value : null);
  }, []);

  useEffect(() => {
    const start = setTimeout(() => void load(), 0);
    const t = setInterval(() => void load(), 5000);
    return () => {
      clearTimeout(start);
      clearInterval(t);
    };
  }, [load]);

  const toggleBot = async () => {
    setToggling(true);
    try {
      const action = status?.running ? "stop" : "start";
      await botAction(action);
      await load();
    } finally {
      setToggling(false);
    }
  };

  const running = !!status?.running;
  const winRate =
    stats && stats.total_trades > 0
      ? ((stats.wins / stats.total_trades) * 100).toFixed(1)
      : "—";

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-white">
          Welcome back, {me?.user?.name?.split(" ")[0] ?? "Trader"}
        </h1>
        <p className="mt-1 text-sm text-soft">Here&apos;s your trading overview.</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Balance"
          value={status?.balance != null ? fmtMoney(status.balance) : "—"}
          tone="primary"
        />
        <StatCard
          label="Win rate"
          value={stats && stats.total_trades > 0 ? `${winRate}%` : "—"}
          tone={
            stats && Number(winRate) >= 55
              ? "success"
              : stats && Number(winRate) < 50
              ? "danger"
              : "neutral"
          }
        />
        <StatCard
          label="Total trades"
          value={stats?.total_trades ?? 0}
          tone={stats && stats.total_trades > 0 ? "neutral" : "neutral"}
        />
        <StatCard
          label="Today P/L"
          value={stats ? fmtSigned(stats.pnl) : "—"}
          tone={
            stats && stats.pnl > 0
              ? "success"
              : stats && stats.pnl < 0
              ? "danger"
              : "neutral"
          }
        />
      </div>

      {/* Bot status + quick actions */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Status card */}
        <div className="app-card p-5">
          <h2 className="mb-4 text-sm font-bold text-white">Bot Status</h2>
          <div className="flex items-center gap-3">
            <StatusDot
              status={offline ? "danger" : running ? "active" : status?.error ? "danger" : "idle"}
              pulse={running}
              size="md"
            />
            <div>
              <p className="text-sm font-semibold capitalize text-white">
                {offline ? "Offline" : running ? "Running" : status?.error ? "Error" : "Idle"}
              </p>
              {running && status?.started_at ? (
                <p className="text-xs text-soft">
                  Uptime: {fmtUptime(status.uptime)}
                </p>
              ) : null}
              {status?.error && !running ? (
                <p className="mt-1 text-xs text-danger">{status.error}</p>
              ) : null}
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <Badge variant={status?.mode === "demo" ? "warning" : "success"}>
              {status?.mode ?? "demo"}
            </Badge>
          </div>
        </div>

        {/* Quick actions */}
        <div className="app-card p-5">
          <h2 className="mb-4 text-sm font-bold text-white">Quick Actions</h2>
          <div className="space-y-3">
            <button
              onClick={toggleBot}
              disabled={toggling || offline}
              className={`w-full rounded-xl px-4 py-3 text-sm font-bold transition-all disabled:opacity-40 ${
                running
                  ? "border border-danger/30 bg-danger/10 text-danger hover:bg-danger/20"
                  : "btn-primary !py-3"
              }`}
            >
              {toggling
                ? "Processing..."
                : running
                ? "Stop Bot"
                : "Start Bot"}
            </button>
            <div className="grid grid-cols-2 gap-2">
              <Link href="/qbot" className="btn-ghost !py-3 text-center text-xs">
                Chart analysis
              </Link>
              <Link href="/history" className="btn-ghost !py-3 text-center text-xs">
                Trade history
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Recent trades */}
      <div className="app-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-sm font-bold text-white">Recent Trades</h2>
          <Link href="/history" className="text-xs font-semibold text-primary hover:text-primary-hover">
            View all
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-line text-soft">
                <th className="px-5 py-3 font-medium">Time</th>
                <th className="px-5 py-3 font-medium">Pair</th>
                <th className="px-5 py-3 font-medium">Direction</th>
                <th className="px-5 py-3 font-medium">Amount</th>
                <th className="px-5 py-3 font-medium">Result</th>
                <th className="px-5 py-3 font-medium text-right">P/L</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(stats?.recent ?? []).slice(0, 5).map((t) => {
                const win = t.result?.toLowerCase() === "win";
                return (
                  <tr key={t.id} className="hover:bg-white/[0.02]">
                    <td className="whitespace-nowrap px-5 py-2.5 tabular-nums text-soft">
                      {new Date(t.time).toLocaleTimeString()}
                    </td>
                    <td className="px-5 py-2.5 font-semibold text-white">{t.pair}</td>
                    <td className="px-5 py-2.5">
                      <Badge variant={t.direction?.toLowerCase() === "buy" || t.direction?.toLowerCase() === "call" ? "success" : "danger"}>
                        {t.direction?.toLowerCase() === "buy" || t.direction?.toLowerCase() === "call" ? "Call" : "Put"}
                      </Badge>
                    </td>
                    <td className="px-5 py-2.5 tabular-nums text-white">${t.amount}</td>
                    <td className="px-5 py-2.5">
                      <Badge variant={win ? "success" : "danger"}>
                        {t.result}
                      </Badge>
                    </td>
                    <td className={`px-5 py-2.5 text-right font-semibold tabular-nums ${win ? "text-success" : "text-danger"}`}>
                      {fmtSigned(Number(t.pnl))}
                    </td>
                  </tr>
                );
              })}
              {(!stats?.recent || stats.recent.length === 0) ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-soft">
                    No trades yet. Start the bot to begin trading.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {/* Notifications preview */}
      <div className="app-card p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-white">Notifications</h2>
          <Link href="/notifications" className="text-xs font-semibold text-primary hover:text-primary-hover">
            View all
          </Link>
        </div>
        <p className="mt-3 text-xs text-soft">No new notifications.</p>
      </div>
    </div>
  );
}