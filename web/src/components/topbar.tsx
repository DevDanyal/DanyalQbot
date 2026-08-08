import type { BotStatus } from "@/lib/types";
import { fmtMoney } from "@/lib/format";

export function Topbar({
  status,
  offline,
  view,
  onViewChange,
}: {
  status: BotStatus | null;
  offline: boolean;
  view: "dashboard" | "history";
  onViewChange: (view: "dashboard" | "history") => void;
}) {
  const running = !!status?.running;
  const state = offline
    ? "offline"
    : running
      ? "running"
      : status?.error
        ? "error"
        : "idle";

  const dotClass = offline
    ? "bg-coral"
    : running
      ? "bg-mint animate-pulse-dot"
      : status?.error
        ? "bg-coral"
        : "bg-faint";

  return (
    <header className="sticky top-0 z-40 border-b border-white/[.07] bg-[#070b14]/75 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-sky to-mint text-ink shadow-[0_4px_18px_rgba(56,189,248,.35)]">
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M3 17l6-6 4 4 8-8" />
              <path d="M15 7h4v4" />
            </svg>
          </div>
          <div>
            <p className="text-[15px] font-bold leading-tight tracking-tight">
              QX Trading
            </p>
            <p className="text-[11px] text-soft">
              Chart analyst &amp; auto trader
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 rounded-xl border border-white/[.08] bg-white/[.03] p-1">
          {(["dashboard", "history"] as const).map((v) => (
            <button
              key={v}
              onClick={() => onViewChange(v)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition ${
                view === v
                  ? "bg-gradient-to-r from-sky to-mint text-ink"
                  : "text-soft hover:text-foreground"
              }`}
            >
              {v === "dashboard" ? "Dashboard" : "History"}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-full border border-white/[.08] bg-white/[.03] px-3.5 py-1.5 text-xs">
            <span className={`size-2 rounded-full ${dotClass}`} />
            <span className="text-soft">{state}</span>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-white/[.08] bg-white/[.03] px-3.5 py-1.5 text-xs">
            <span className="text-soft">Balance</span>
            <span className="font-semibold tabular-nums">
              {status?.balance != null ? fmtMoney(status.balance) : "—"}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
