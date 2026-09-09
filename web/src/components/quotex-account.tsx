"use client";

import { useCallback, useEffect, useState } from "react";
import type { QuotexAccount } from "@/lib/types";
import { Panel, PanelHead } from "@/components/ui";

export function QuotexAccountPanel({
  onAccountsChange,
}: {
  onAccountsChange: (accounts: QuotexAccount[]) => void;
}) {
  const [accounts, setAccounts] = useState<QuotexAccount[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"demo" | "live">("demo");
  const [msg, setMsg] = useState<{ text: string; err: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/account/quotex", { cache: "no-store" });
      const data = await res.json();
      if (data.ok) {
        setAccounts(data.accounts ?? []);
        onAccountsChange(data.accounts ?? []);
      }
    } catch {
      /* backend not needed for account list */
    }
  }, [onAccountsChange]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/account/quotex", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, mode }),
      });
      const data = await res.json();
      if (data.ok) {
        setEmail("");
        setPassword("");
        setMsg({ text: "Quotex account connected.", err: false });
        await load();
      } else {
        setMsg({ text: data.message ?? "Could not save account.", err: true });
      }
    } catch {
      setMsg({ text: "Network error.", err: true });
    } finally {
      setBusy(false);
    }
  };

  const setActive = async (id: number) => {
    try {
      await fetch("/api/account/quotex", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activeId: id }),
      });
      await load();
    } catch {
      /* ignore */
    }
  };

  const remove = async (id: number) => {
    try {
      await fetch(`/api/account/quotex?id=${id}`, { method: "DELETE" });
      await load();
    } catch {
      /* ignore */
    }
  };

  const active = accounts.find((a) => a.isActive);

  const input =
    "w-full rounded-xl border border-white/[.1] bg-black/20 px-3.5 py-2.5 text-sm outline-none focus:border-sky/60";

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
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="M8 9h8" />
            <path d="M8 13h5" />
          </svg>
        }
        title="Your Quotex Account"
        sub="Connect the Quotex account this bot will trade on. You can switch or remove it anytime."
      />

      {active ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-mint/25 bg-mint/[.06] px-4 py-3">
          <div className="text-sm">
            <span className="font-medium">{active.email}</span>
            <span className="ml-2 rounded-full bg-white/[.06] px-2 py-0.5 text-[11px] font-semibold text-soft">
              {active.mode === "live" ? "LIVE" : "demo"}
            </span>
          </div>
          <span className="rounded-full bg-mint/15 px-2.5 py-0.5 text-[11px] font-semibold text-mint">
            active
          </span>
        </div>
      ) : (
        <p className="mb-4 rounded-xl border border-coral/25 bg-coral/[.07] px-4 py-3 text-xs text-coral">
          No Quotex account connected. Connect one below — the real-mode
          trading button needs it.
        </p>
      )}

      <form onSubmit={save} className="space-y-2.5">
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Quotex login email"
          type="email"
          required
          className={input}
        />
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Quotex password"
          type="password"
          required
          className={input}
        />
        <div className="flex gap-2.5">
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as "demo" | "live")}
            className={`${input} px-3`}
            title="Account mode"
          >
            <option value="demo">Demo account (safe)</option>
            <option value="live">Live account</option>
          </select>
          <button
            type="submit"
            disabled={busy}
            className="shrink-0 rounded-xl bg-gradient-to-r from-sky to-mint px-4 py-2.5 text-sm font-bold text-ink transition hover:opacity-90 disabled:opacity-40"
          >
            {busy ? "Saving…" : "Connect"}
          </button>
        </div>
      </form>

      {msg ? (
        <p className={`mt-2.5 text-xs ${msg.err ? "text-coral" : "text-mint"}`}>
          {msg.text}
        </p>
      ) : null}

      {accounts.length > 1 ? (
        <div className="mt-4 space-y-1.5 border-t border-white/[.06] pt-3">
          <p className="text-[11px] uppercase tracking-wide text-faint">
            Other connected accounts
          </p>
          {accounts
            .filter((a) => !a.isActive)
            .map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-white/[.06] bg-black/20 px-3.5 py-2.5 text-sm"
              >
                <span className="truncate font-medium">{a.email}</span>
                <div className="flex shrink-0 items-center gap-1.5 text-xs">
                  {a.mode === "live" ? (
                    <span className="rounded-full bg-coral/10 px-2 py-0.5 font-semibold text-coral">
                      LIVE
                    </span>
                  ) : null}
                  <button
                    onClick={() => setActive(a.id)}
                    className="rounded-lg border border-white/[.1] px-2 py-1 text-sky hover:bg-white/[.05]"
                  >
                    Use
                  </button>
                  <button
                    onClick={() => remove(a.id)}
                    className="rounded-lg border border-coral/30 px-2 py-1 text-coral hover:bg-coral/10"
                  >
                    Disconnect
                  </button>
                </div>
              </div>
            ))}
        </div>
      ) : null}
    </Panel>
  );
}