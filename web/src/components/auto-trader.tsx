"use client";

import { useState } from "react";
import type { BotStatus, Stats } from "@/lib/types";
import { botAction } from "@/lib/api";
import { fmtMoney, fmtSigned, fmtUptime, todayKey } from "@/lib/format";
import { Dot, Panel, PanelHead } from "@/components/ui";

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/[.06] bg-black/20 px-4 py-2.5 text-sm">
      <span className="text-soft">{label}</span>
      <span className="flex items-center gap-2 font-medium tabular-nums">
        {children}
      </span>
    </div>
  );
}

export function AutoTrader({
  status,
  stats,
  onAction,
}: {
  status: BotStatus | null;
  stats: Stats | null;
  onAction: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; err: boolean } | null>(null);

  const running = !!status?.running;

  const act = async (action: "start" | "stop", mock = false) => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await botAction(action, mock);
      setMsg({ text: res.message, err: !res.ok });
      onAction();
    } catch (e) {
      setMsg({
        text: e instanceof Error ? e.message : "Request failed",
        err: true,
      });
    } finally {
      setBusy(false);
    }
  };

  const today = stats?.daily?.find((r) => r.day === todayKey());
  const pnlToday = Number(today?.pnl ?? 0);
  const mini = [
    { n: Number(today?.trades ?? 0), l: "Trades", c: "text-foreground" },
    { n: Number(today?.wins ?? 0), l: "Wins", c: "text-mint" },
    { n: Number(today?.losses ?? 0), l: "Losses", c: "text-coral" },
    {
      n: fmtSigned(pnlToday),
      l: "P/L today",
      c: pnlToday > 0 ? "text-mint" : pnlToday < 0 ? "text-coral" : "text-foreground",
    },
  ];

  const btnBase =
    "flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold transition active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <Panel>
      <PanelHead
        icon={
          <svg
            viewBox="0 0 24 24"
            width="17"
            height="17"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <rect x="5" y="8" width="14" height="11" rx="2" />
            <circle cx="12" cy="13" r="1.6" />
            <path d="M12 8V4.5" />
            <path d="M9 2h6" />
          </svg>
        }
        title="Auto Trader"
        sub="The bot connects to Quotex and trades on its own using the trend strategy."
      />

      <div className="space-y-2">
        <Row label="Status">
          <Dot tone={running ? "on" : status?.error ? "err" : "off"} pulse={running} />
          <span>
            {status?.error
              ? "error"
              : running
                ? "running"
                : "idle"}
          </span>
        </Row>
        <Row label="Mode">{status?.mode ?? "—"}</Row>
        <Row label="Balance">
          {status?.balance != null ? fmtMoney(status.balance) : "—"}
        </Row>
        <Row label="Uptime">
          {running ? fmtUptime(status?.uptime ?? 0) : "—"}
        </Row>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          onClick={() => act("start")}
          disabled={running || busy}
          className={`${btnBase} bg-gradient-to-r from-mint to-emerald-300 text-ink hover:brightness-110`}
        >
          ▶ Start trading
        </button>
        <button
          onClick={() => act("stop")}
          disabled={!running || busy}
          className={`${btnBase} bg-gradient-to-r from-coral to-rose-400 text-ink hover:brightness-110`}
        >
          ■ Stop
        </button>
      </div>
      <button
        onClick={() => act("start", true)}
        disabled={running || busy}
        title="Start with the fake market (no real trading)"
        className={`${btnBase} mt-2 w-full border border-white/[.12] bg-white/[.03] text-soft hover:bg-white/[.07]`}
      >
        Test mode · mock market
      </button>

      {msg ? (
        <p
          className={`mt-3 text-xs ${msg.err ? "text-coral" : "text-mint"}`}
        >
          {msg.text}
        </p>
      ) : (
        <p className="mt-3 text-xs text-faint">
          Demo account first — the bot follows fixed % bet sizes and a daily
          loss limit.
        </p>
      )}

      <div className="mt-5 grid grid-cols-4 gap-2.5">
        {mini.map((s) => (
          <div
            key={s.l}
            className="rounded-xl border border-white/[.06] bg-black/20 p-3 text-center"
          >
            <p className={`text-lg font-bold tabular-nums ${s.c}`}>{s.n}</p>
            <p className="mt-0.5 text-[10px] uppercase tracking-wide text-faint">
              {s.l}
            </p>
          </div>
        ))}
      </div>
    </Panel>
  );
}
