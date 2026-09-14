"use client";

import type { ReactNode } from "react";

/* ── Design system primitives for the Danyal QBot customer app ─────────────── */

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <div className={`h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent ${className}`} />
  );
}

export function LoadingPage({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-soft">
      <Spinner />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  detail,
  onRetry,
}: {
  title?: string;
  detail?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="grid size-14 place-items-center rounded-full bg-danger/10 text-danger">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <p className="text-sm font-semibold text-white">{title}</p>
      {detail ? <p className="max-w-sm text-xs text-soft">{detail}</p> : null}
      {onRetry ? (
        <button onClick={onRetry} className="btn-primary mt-2 !px-5 !py-2">
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  detail,
  action,
}: {
  icon?: ReactNode;
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-10 text-center">
      {icon ? (
        <div className="grid size-12 place-items-center rounded-full bg-white/[0.04] text-faint">
          {icon}
        </div>
      ) : null}
      <p className="text-sm font-semibold text-white">{title}</p>
      {detail ? <p className="max-w-xs text-xs text-soft">{detail}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-white">{title}</h1>
        {subtitle ? (
          <p className="mt-1 text-sm text-soft">{subtitle}</p>
        ) : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: string | number;
  tone?: "success" | "warning" | "danger" | "neutral" | "primary";
  icon?: ReactNode;
}) {
  const toneClass = {
    success: "border-success/20 bg-success/[0.07] text-success",
    warning: "border-warning/20 bg-warning/[0.07] text-warning",
    danger: "border-danger/20 bg-danger/[0.07] text-danger",
    neutral: "border-card-border bg-white/[0.03]",
    primary: "border-primary/20 bg-primary/[0.07] text-primary",
  }[tone];

  return (
    <div className={`app-card overflow-hidden p-4 ${toneClass}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-soft">{label}</p>
        {icon ? <span className="text-soft">{icon}</span> : null}
      </div>
      <p className={`mt-2 text-2xl font-bold tabular-nums ${tone.includes("success") || tone === "primary" ? toneClass.split(" ").pop()! : "text-white"}`}>{value}</p>
    </div>
  );
}

export function StatusDot({
  status,
  pulse = false,
  size = "sm",
}: {
  status: "active" | "warning" | "danger" | "idle" | "offline";
  pulse?: boolean;
  size?: "sm" | "md";
}) {
  const map = {
    active: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
    idle: "bg-faint",
    offline: "bg-coral",
  }[status];
  const sizeClass = size === "md" ? "h-2.5 w-2.5" : "h-2 w-2";
  return (
    <span
      className={`inline-block shrink-0 rounded-full ${sizeClass} ${map} ${pulse ? "animate-pulse-dot" : ""}`}
    />
  );
}

export function Badge({
  children,
  variant = "default",
  className = "",
}: {
  children: ReactNode;
  variant?: "success" | "warning" | "danger" | "primary" | "default";
  className?: string;
}) {
  const base = "badge";
  const variants = {
    success: "bg-success/10 text-success",
    warning: "bg-warning/10 text-warning",
    danger: "bg-danger/10 text-danger",
    primary: "bg-primary/10 text-primary",
    default: "bg-white/[0.06] text-soft",
  }[variant];
  return <span className={`${base} ${variants} ${className}`}>{children}</span>;
}

export function ActionCard({
  icon,
  label,
  description,
  onClick,
  disabled = false,
  variant = "default",
}: {
  icon: ReactNode;
  label: string;
  description?: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "success" | "danger" | "default";
}) {
  const variantClass = {
    success: "border-success/25 bg-success/[0.06] hover:border-success/40 text-success",
    danger: "border-danger/25 bg-danger/[0.06] hover:border-danger/40 text-danger",
    default: "hover:border-white/[0.2] hover:bg-white/[0.05] text-soft hover:text-white",
  }[variant];

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-start gap-4 rounded-2xl border border-card-border bg-white/[0.02] p-4 text-left transition-all disabled:opacity-40 disabled:cursor-not-allowed app-card-hover ${variantClass}`}
    >
      <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/[0.05] text-current">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold">{label}</p>
        {description ? (
          <p className="mt-1 text-xs leading-relaxed text-soft">{description}</p>
        ) : null}
      </div>
    </button>
  );
}

export function SectionCard({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="app-card overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-white">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-xs text-soft">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}
