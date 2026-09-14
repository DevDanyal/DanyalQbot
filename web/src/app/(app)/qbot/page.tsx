"use client";

import { useCallback, useEffect, useState } from "react";
import { AutoTrader } from "@/components/auto-trader";
import { QuotexAccountPanel } from "@/components/quotex-account";
import { ChartAnalyst } from "@/components/chart-analyst";
import { getStatus, getStats } from "@/lib/api";
import type { BotStatus, QuotexAccount, Stats } from "@/lib/types";

export default function QBotPage() {
  const [status, setStatus] = useState<BotStatus | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [accounts, setAccounts] = useState<QuotexAccount[]>([]);

  const reload = useCallback(async () => {
    const [s, st] = await Promise.allSettled([getStatus(), getStats()]);
    if (s.status === "fulfilled") setStatus(s.value);
    if (st.status === "fulfilled") setStats(st.value);
  }, []);

  useEffect(() => {
    const start = setTimeout(() => void reload(), 0);
    const t = setInterval(() => void reload(), 5000);
    return () => {
      clearTimeout(start);
      clearInterval(t);
    };
  }, [reload]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-white">QBot Control</h1>
        <p className="mt-1 text-sm text-soft">
          Manage your automated trading, Quotex account, and chart analysis.
        </p>
      </div>
      <AutoTrader
        status={status}
        stats={stats}
        account={accounts[0] ?? null}
        onAction={reload}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <QuotexAccountPanel onAccountsChange={setAccounts} />
        <ChartAnalyst />
      </div>
    </div>
  );
}