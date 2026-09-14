"use client";

import { useCallback, useEffect, useState } from "react";
import { getHistory } from "@/lib/api";
import { HistoryView } from "@/components/history-view";
import { LoadingPage } from "@/components/app-ui";
import type { HistoryResponse } from "@/lib/types";

export default function HistoryPage() {
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [offline, setOffline] = useState(false);

  const load = useCallback(async () => {
    try {
      const h = await getHistory();
      setHistory(h);
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, []);

  useEffect(() => {
    const start = setTimeout(() => void load(), 0);
    const t = setInterval(() => void load(), 5000);
    return () => {
      clearTimeout(start);
      clearInterval(t);
    };
  }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-white">Trade History</h1>
        <p className="mt-1 text-sm text-soft">
          Daily breakdown of your trades, wins, and profit/loss.
        </p>
      </div>
      {!history && !offline ? (
        <LoadingPage label="Loading history..." />
      ) : (
        <HistoryView history={history} offline={offline} />
      )}
    </div>
  );
}