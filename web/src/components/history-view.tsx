"use client";

import { useState } from "react";
import type { HistoryResponse } from "@/lib/types";
import { dayMeta, fmtSigned } from "@/lib/format";
import { EmptyRow, Panel, PanelHead } from "@/components/ui";
import { TradesTable } from "@/components/trades-table";

export function HistoryView({
  history,
  offline,
}: {
  history: HistoryResponse | null;
  offline: boolean;
}) {
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [userToggled, setUserToggled] = useState(false);

  const days = history?.days ?? [];
  const activeDay = userToggled ? openDay : (days[0]?.day ?? null);

  const toggle = (day: string) => {
    setUserToggled(true);
    setOpenDay(openDay === day ? null : day);
  };

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
            <path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6z" />
            <path d="M4 15h16" />
            <path d="M6 18h2" />
            <path d="M12 18h2" />
            <path d="M18 18h0" />
          </svg>
        }
        title="History"
        sub="Your past trades, grouped by day. Tap a day to open its trades."
      />

      {offline && history === null ? (
        <EmptyRow text="Backend offline — start it with: python run_web.py" />
      ) : days.length === 0 ? (
        <EmptyRow text="No history yet — your trades will appear here grouped by day once the bot starts trading." />
      ) : (
        <div className="space-y-3">
          {days.map((d) => {
            const { weekday, date } = dayMeta(d.day);
            const open = activeDay === d.day;
            const pnl = Number(d.pnl || 0);
            return (
              <div
                key={d.day}
                className={`overflow-hidden rounded-2xl border transition-colors ${
                  open
                    ? "border-white/[.14] bg-black/25"
                    : "border-white/[.07] bg-black/15 hover:border-white/[.12]"
                }`}
              >
                <button
                  onClick={() => toggle(d.day)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                  aria-expanded={open}
                >
                  <div>
                    <p className="text-sm font-semibold tracking-tight">
                      {weekday}
                    </p>
                    <p className="mt-0.5 text-xs tabular-nums text-faint">
                      {date}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="hidden items-center gap-1.5 sm:flex">
                      <Chip
                        tone="neutral"
                        text={`${d.trades.length} trades`}
                      />
                      <Chip tone="mint" text={`${d.wins} wins`} />
                      <Chip tone="coral" text={`${d.losses} losses`} />
                      <Chip
                        tone={pnl > 0 ? "mint" : pnl < 0 ? "coral" : "neutral"}
                        text={fmtSigned(pnl)}
                      />
                    </div>
                    <svg
                      viewBox="0 0 24 24"
                      width="16"
                      height="16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                      className={`shrink-0 text-faint transition-transform ${open ? "rotate-180" : ""}`}
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </div>
                </button>

                {open ? (
                  <div className="border-t border-white/[.06] p-3 sm:p-4">
                    <div className="mb-3 flex items-center gap-1.5 sm:hidden">
                      <Chip tone="neutral" text={`${d.trades.length} trades`} />
                      <Chip tone="mint" text={`${d.wins} wins`} />
                      <Chip tone="coral" text={`${d.losses} losses`} />
                      <Chip
                        tone={pnl > 0 ? "mint" : pnl < 0 ? "coral" : "neutral"}
                        text={fmtSigned(pnl)}
                      />
                    </div>
                    <TradesTable trades={d.trades} showReason />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

function Chip({
  tone,
  text,
}: {
  tone: "mint" | "coral" | "neutral";
  text: string;
}) {
  const cls =
    tone === "mint"
      ? "bg-mint/10 text-mint"
      : tone === "coral"
        ? "bg-coral/10 text-coral"
        : "bg-white/[.06] text-soft";
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${cls}`}
    >
      {text}
    </span>
  );
}
