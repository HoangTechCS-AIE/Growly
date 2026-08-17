import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/util";

export function Card({
  title,
  hint,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("card flex min-w-0 flex-col", className)}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          <div className="min-w-0">
            <h2 className="truncate text-[13px] font-semibold text-ink">{title}</h2>
            {hint && <p className="truncate text-[11px] text-muted">{hint}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className={cn("min-w-0 p-3", bodyClassName)}>{children}</div>
    </section>
  );
}

/** A headline number. `tone` carries severity, never decoration. */
export function StatTile({
  label,
  value,
  sub,
  tone = "neutral",
  href,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad";
  href?: string;
}) {
  const toneClass = {
    neutral: "text-ink",
    good: "text-accent",
    warn: "text-warn",
    bad: "text-danger",
  }[tone];

  const body = (
    <>
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted">{label}</p>
      <p className={cn("mt-1 text-[26px] font-semibold leading-none tabular-nums", toneClass)}>
        {value}
      </p>
      {sub && <p className="mt-1.5 text-[11.5px] text-muted">{sub}</p>}
    </>
  );

  if (href) {
    return (
      <Link href={href} className="card-pad transition hover:border-line-strong">
        {body}
      </Link>
    );
  }
  return <div className="card-pad">{body}</div>;
}

/** A single ratio against a limit. The fill carries severity. */
export function Meter({
  value,
  max,
  tone = "accent",
  className,
}: {
  value: number;
  max: number;
  tone?: "accent" | "warn" | "danger" | "muted";
  className?: string;
}) {
  const share = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const fill = {
    accent: "bg-accent",
    warn: "bg-warn",
    danger: "bg-danger",
    muted: "bg-muted",
  }[tone];
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-3", className)}>
      <div className={cn("h-full rounded-full transition-all", fill)} style={{ width: `${share}%` }} />
    </div>
  );
}

/** Small column chart: one hue, today highlighted, values on demand. */
export function MiniBars({
  data,
  unit = "",
  height = 84,
}: {
  data: { label: string; value: number; emphasis?: boolean; title?: string }[];
  unit?: string;
  height?: number;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div>
      <div className="flex items-end gap-[3px]" style={{ height }}>
        {data.map((d, i) => (
          <div key={`${d.label}-${i}`} className="flex h-full flex-1 flex-col justify-end">
            <div
              title={d.title ?? `${d.label}: ${d.value}${unit}`}
              className={cn(
                "w-full rounded-t-[4px] transition-all",
                d.emphasis ? "bg-accent" : "bg-accent/35",
              )}
              style={{ height: `${Math.max(d.value > 0 ? 3 : 1, (d.value / max) * 100)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-[3px] border-t border-line pt-1.5">
        {data.map((d, i) => (
          <span
            key={`${d.label}-label-${i}`}
            className={cn(
              "flex-1 text-center text-[10px] tabular-nums",
              d.emphasis ? "font-semibold text-ink" : "text-muted",
            )}
          >
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
      <p className="text-[13px] font-medium text-ink">{title}</p>
      {hint && <p className="max-w-sm text-[12px] leading-relaxed text-muted">{hint}</p>}
      {action}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[19px] font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-0.5 text-[12.5px] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
