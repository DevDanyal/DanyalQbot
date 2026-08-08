import type { ReactNode } from "react";

export function Panel({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`rounded-2xl border border-white/[.08] bg-white/[.03] p-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,.04)] transition-colors hover:border-white/[.15] sm:p-6 ${className}`}
    >
      {children}
    </section>
  );
}

export function PanelHead({
  icon,
  title,
  sub,
  right,
}: {
  icon: ReactNode;
  title: string;
  sub?: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-lg border border-white/[.08] bg-white/[.05] text-sky">
          {icon}
        </div>
        <div>
          <h2 className="text-[15px] font-semibold leading-tight tracking-tight">
            {title}
          </h2>
          {sub ? (
            <p className="mt-1 text-xs leading-relaxed text-soft">{sub}</p>
          ) : null}
        </div>
      </div>
      {right}
    </div>
  );
}

export function Dot({
  tone,
  pulse,
}: {
  tone: "on" | "off" | "idle" | "err";
  pulse?: boolean;
}) {
  const map = {
    on: "bg-mint",
    err: "bg-coral",
    idle: "bg-faint",
    off: "bg-coral",
  } as const;
  return (
    <span
      className={`inline-block size-2 shrink-0 rounded-full ${map[tone]} ${pulse ? "animate-pulse-dot" : ""}`}
    />
  );
}

export function ResultTag({ r }: { r: string }) {
  if (r === "WIN") {
    return (
      <span className="rounded-full bg-mint/10 px-2 py-0.5 text-[11px] font-semibold text-mint">
        WIN
      </span>
    );
  }
  if (r === "LOSS") {
    return (
      <span className="rounded-full bg-coral/10 px-2 py-0.5 text-[11px] font-semibold text-coral">
        LOSS
      </span>
    );
  }
  return (
    <span className="rounded-full bg-white/[.06] px-2 py-0.5 text-[11px] font-semibold text-soft">
      {r || "…"}
    </span>
  );
}

export function EmptyRow({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-white/[.1] px-4 py-8 text-center text-xs text-faint">
      {text}
    </div>
  );
}
