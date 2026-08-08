"use client";

import { useState } from "react";
import type { Stats, Trade } from "@/lib/types";
import { fmtSigned } from "@/lib/format";
import { EmptyRow, Panel, PanelHead } from "@/components/ui";
import { TradesTable } from "@/components/trades-table";

function Sparkline({ trades }: { trades: Trade[] }) {
  const points = trades
    .slice()
    .reverse()
    .reduce<number[]>((acc, t) => {
      const prev = acc.length ? acc[acc.length - 1] : 0;
      acc.push(prev + Number(t.pnl || 0));
      return acc;
    }, []);

  if (points.length < 2) {
    return (
      <div className="flex h-16 items-center text-xs text-faint">
        Need 2+ trades for a chart
      </div>
    );
  }

  const min = Math.min(0, ...points);
  const max = Math.max(0, ...points);
  const span = max - min || 1;
  const W = 560;
  const H = 72;
  const PAD = 8;

  const coords = points.map((v, i) => [
    PAD + (i / (points.length - 1)) * (W - PAD * 2),
    H - PAD - ((v - min) / span) * (H - PAD * 2),
  ]);
  const line = coords
    .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const area = `${coords[0][0].toFixed(1)},${H} ${line} ${coords[coords.length - 1][0].toFixed(1)},${H}`;
  const up = points[points.length - 1] >= 0;
  const stroke = up ? "#2fe6a3" : "#ff5c72";

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="h-16 w-full max-w-[300px]"
    >
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.3" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill="url(#spark-fill)" />
      <polyline
        points={line}
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

const TABS = [
  { key: "recent", label: "Recent trades" },
  { key: "daily", label: "Daily summary" },
  { key: "learned", label: "Learned situations" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function TradeHistory({ stats }: { stats: Stats | null }) {
  const [tab, setTab] = useState<TabKey>("recent");

  const total = stats?.total_trades ?? 0;
  const wins = stats?.wins ?? 0;
  const losses = stats?.losses ?? 0;
  const pnl = stats?.pnl ?? 0;

  const tiles = [
    { n: String(total), l: "All trades", c: "text-foreground" },
    { n: String(wins), l: "Wins", c: "text-mint" },
    { n: String(losses), l: "Losses", c: "text-coral" },
    {
      n: `${stats?.win_rate ?? 0}%`,
      l: "Win rate",
      c: "text-foreground",
    },
    {
      n: fmtSigned(pnl),
      l: "Net P/L",
      c: pnl > 0 ? "text-mint" : pnl < 0 ? "text-coral" : "text-foreground",
    },
  ];

  const recent = stats?.recent ?? [];
  const daily = stats?.daily ?? [];
  const slots = stats?.experience?.slots ?? {};

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
            <path d="M3 3v16a2 2 0 0 0 2 2h16" />
            <path d="M7 13l4-4 3 3 5-6" />
          </svg>
        }
        title="Trade History"
        sub="Every trade the bot took — live performance over the session."
        right={
          <div className="hidden text-right sm:block">
            <p className="text-[10px] uppercase tracking-wide text-faint">
              Last {Math.max(recent.length, 0)} trades
            </p>
            <Sparkline trades={recent} />
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
        {tiles.map((t) => (
          <div
            key={t.l}
            className="rounded-xl border border-white/[.06] bg-black/20 p-3.5 text-center"
          >
            <p className={`text-2xl font-bold tabular-nums ${t.c}`}>{t.n}</p>
            <p className="mt-1 text-[10px] uppercase tracking-wide text-faint">
              {t.l}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-5 flex gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              tab === t.key
                ? "bg-gradient-to-r from-sky to-mint text-ink"
                : "text-soft hover:bg-white/[.05]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "recent" &&
        (recent.length ? (
          <div className="mt-4">
            <TradesTable trades={recent} />
          </div>
        ) : (
          <div className="mt-4">
            <EmptyRow text="No trades yet — start the bot and its trades will appear here." />
          </div>
        ))}

      {tab === "daily" &&
        (daily.length ? (
          <div className="mt-4 overflow-x-auto rounded-xl border border-white/[.07]">
            <table className="w-full min-w-[420px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-white/[.07] text-left text-[11px] uppercase tracking-wide text-faint">
                  <th className="px-3.5 py-2.5 font-medium">Day</th>
                  <th className="px-3.5 py-2.5 font-medium">Trades</th>
                  <th className="px-3.5 py-2.5 font-medium">Wins</th>
                  <th className="px-3.5 py-2.5 font-medium">Losses</th>
                  <th className="px-3.5 py-2.5 text-right font-medium">P/L</th>
                </tr>
              </thead>
              <tbody>
                {daily.map((r) => {
                  const pnl = Number(r.pnl || 0);
                  return (
                    <tr
                      key={r.day}
                      className="border-b border-white/[.04] last:border-0 hover:bg-white/[.02]"
                    >
                      <td className="px-3.5 py-2.5 tabular-nums">{r.day}</td>
                      <td className="px-3.5 py-2.5 tabular-nums">{r.trades}</td>
                      <td className="px-3.5 py-2.5 tabular-nums text-mint">
                        {r.wins}
                      </td>
                      <td className="px-3.5 py-2.5 tabular-nums text-coral">
                        {r.losses}
                      </td>
                      <td
                        className={`px-3.5 py-2.5 text-right tabular-nums ${
                          pnl > 0 ? "text-mint" : pnl < 0 ? "text-coral" : ""
                        }`}
                      >
                        {fmtSigned(pnl)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-4">
            <EmptyRow text="No daily summaries yet — they appear once the bot has traded for a day." />
          </div>
        ))}

      {tab === "learned" &&
        (Object.keys(slots).length ? (
          <div className="mt-4 overflow-x-auto rounded-xl border border-white/[.07]">
            <table className="w-full min-w-[420px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-white/[.07] text-left text-[11px] uppercase tracking-wide text-faint">
                  <th className="px-3.5 py-2.5 font-medium">Situation</th>
                  <th className="px-3.5 py-2.5 font-medium">Trades</th>
                  <th className="px-3.5 py-2.5 font-medium">Win rate</th>
                  <th className="px-3.5 py-2.5 text-right font-medium">P/L</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(slots)
                  .slice(0, 25)
                  .map(([k, s]) => {
                    const rate = s.trades
                      ? Math.round((100 * s.wins) / s.trades)
                      : 0;
                    return (
                      <tr
                        key={k}
                        className="border-b border-white/[.04] last:border-0 hover:bg-white/[.02]"
                      >
                        <td className="px-3.5 py-2.5">{k}</td>
                        <td className="px-3.5 py-2.5 tabular-nums">{s.trades}</td>
                        <td className="px-3.5 py-2.5 tabular-nums">{rate}%</td>
                        <td
                          className={`px-3.5 py-2.5 text-right tabular-nums ${
                            s.pnl > 0 ? "text-mint" : s.pnl < 0 ? "text-coral" : ""
                          }`}
                        >
                          {fmtSigned(s.pnl)}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-4">
            <EmptyRow text="No situations learned yet — the bot shows which slots it avoids once it has enough history." />
          </div>
        ))}
    </Panel>
  );
}
