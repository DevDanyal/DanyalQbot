"use client";

import { useCallback, useEffect, useState } from "react";

export interface PollState<T> {
  data: T | null;
  error: string | null;
  refresh: () => void;
}

export function usePoll<T>(
  fetcher: () => Promise<T>,
  intervalMs: number,
): PollState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    try {
      const d = await fetcher();
      setData(d);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    }
  }, [fetcher]);

  useEffect(() => {
    const first = setTimeout(run, 0);
    const id = setInterval(run, intervalMs);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [run, intervalMs]);

  const refresh = useCallback(() => {
    void run();
  }, [run]);

  return { data, error, refresh };
}
