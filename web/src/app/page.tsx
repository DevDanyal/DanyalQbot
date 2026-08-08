"use client";

import { useCallback } from "react";
import { getStatus, getStats } from "@/lib/api";
import { usePoll } from "@/lib/use-poll";
import { Topbar } from "@/components/topbar";
import { ChartAnalyst } from "@/components/chart-analyst";
import { AutoTrader } from "@/components/auto-trader";
import { TradeHistory } from "@/components/trade-history";

export default function Page() {
  const status = usePoll(useCallback(() => getStatus(), []), 3000);
  const stats = usePoll(useCallback(() => getStats(), []), 5000);

  const offline = !!status.error;
  const refresh = () => {
    status.refresh();
    stats.refresh();
  };

  return (
    <div className="relative flex min-h-screen flex-col">
      <div
        className="bg-grid pointer-events-none fixed inset-0 -z-10"
        aria-hidden
      />
      <Topbar status={status.data} offline={offline} />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-8 sm:px-6 lg:px-8">
        {offline && status.data === null ? (
          <div className="mb-6 rounded-2xl border border-coral/25 bg-coral/[.07] px-5 py-4 text-sm text-coral">
            <strong>Trading backend offline.</strong> Start it with{" "}
            <code className="rounded bg-black/30 px-1.5 py-0.5 text-xs">
              python run_web.py
            </code>{" "}
            and this dashboard will reconnect automatically.
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ChartAnalyst />
          <AutoTrader
            status={status.data}
            stats={stats.data}
            onAction={refresh}
          />
        </div>

        <div className="mt-6">
          <TradeHistory stats={stats.data} />
        </div>
      </main>

      <footer className="pb-10 pt-8 text-center text-xs text-faint">
        Personal project · Demo account first · Always manage risk — no bot can
        guarantee profit.
      </footer>
    </div>
  );
}
