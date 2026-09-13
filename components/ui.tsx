import Link from "next/link";
import type { ReactNode } from "react";
import { cn, dotTone } from "@/lib/util";
import { IconArrowRight } from "./icons";

/* ---------------------------------------------------------------- tiles -- */

/** The bento building block: a rounded surface with an optional small-caps
    title row. `accent` paints it deep green for the one thing that matters. */
export function Tile({
  title,
  hint,
  action,
  children,
  className,
  accent = false,
  small = false,
  as: Tag = "section",
}: {
  title?: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  accent?: boolean;
  small?: boolean;
  as?: "section" | "div" | "article";
}) {
  return (
    <Tag className={cn("tile", small && "tile-sm", accent && "tile-accent", className)}>
      {(title || action) && (
        <header className="tile-head">
          <div className="min-w-0">
            {title && <h2 className="tile-title">{title}</h2>}
            {hint && <p className={cn("tile-hint mt-0.5", accent && "text-accent-deep-ink/70")}>{hint}</p>}
          </div>
          {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
        </header>
      )}
      {children}
    </Tag>
  );
}

/** Older name, same thing. */
export function Card(props: Parameters<typeof Tile>[0] & { bodyClassName?: string }) {
  const { bodyClassName: _ignored, ...rest } = props;
  void _ignored;
  return <Tile {...rest} />;
}

/** A headline number. `tone` carries severity, never decoration. */
export function StatTile({
  label,
  value,
  sub,
  tone = "neutral",
  href,
  className,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad";
  href?: string;
  className?: string;
}) {
  const toneClass = {
    neutral: "text-ink",
    good: "text-accent",
    warn: "text-warn",
    bad: "text-danger",
  }[tone];

  const body = (
    <>
      <p className="tile-title">{label}</p>
      <p className={cn("text-3xl font-extrabold leading-none tracking-tight tabular-nums", toneClass)}>
        {value}
      </p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={cn("tile tile-sm gap-2 transition hover:border-line-strong", className)}>
        {body}
      </Link>
    );
  }
  return <div className={cn("tile tile-sm gap-2", className)}>{body}</div>;
}

/* --------------------------------------------------------------- meters -- */

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
    muted: "bg-line-strong",
  }[tone];
  return (
    <div className={cn("bar", className)} role="img" aria-label={`${share}%`}>
      <span className={fill} style={{ width: `${share}%` }} />
    </div>
  );
}

/** A ring gauge with the percentage in the middle. */
export function Ring({
  value,
  max,
  size = 112,
  stroke = 11,
  tone = "accent",
  label,
  className,
}: {
  value: number;
  max: number;
  size?: number;
  stroke?: number;
  tone?: "accent" | "warn" | "danger";
  label?: ReactNode;
  className?: string;
}) {
  const share = max > 0 ? Math.min(1, value / max) : 0;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const color = { accent: "var(--accent)", warn: "var(--warn)", danger: "var(--danger)" }[tone];
  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${circumference * share} ${circumference}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="transition-all"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-xl font-extrabold tracking-tight tabular-nums">
        {label ?? `${Math.round(share * 100)}%`}
      </div>
    </div>
  );
}

/** Small column chart: one hue, today highlighted, values on demand. */
export function MiniBars({
  data,
  unit = "",
  height = 64,
}: {
  data: { label: string; value: number; emphasis?: boolean; title?: string }[];
  unit?: string;
  height?: number;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div>
      <div className="flex items-end gap-1.5" style={{ height }}>
        {data.map((d, i) => (
          <div key={`${d.label}-${i}`} className="flex h-full flex-1 flex-col justify-end">
            <div
              title={d.title ?? `${d.label}: ${d.value}${unit}`}
              className={cn(
                "w-full rounded-[6px] transition-all",
                d.value > 0 ? (d.emphasis ? "bg-accent" : "bg-accent/40") : "bg-surface-3",
              )}
              style={{ height: d.value > 0 ? `${Math.max(8, (d.value / max) * 100)}%` : 4 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-1.5">
        {data.map((d, i) => (
          <span
            key={`${d.label}-label-${i}`}
            className={cn(
              "flex-1 text-center text-[11px] tabular-nums",
              d.emphasis ? "font-bold text-ink" : "text-muted",
            )}
          >
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- pieces -- */

/** Where a task sits: its project, or the area it falls under. */
export function Ladder({
  project,
  projectColor,
  area,
  className,
  onDark = false,
}: {
  project?: string | null;
  projectColor?: string | null;
  area?: string | null;
  className?: string;
  onDark?: boolean;
}) {
  const parts: ReactNode[] = [];
  if (project) {
    parts.push(
      <span key="project" className="inline-flex min-w-0 items-center gap-1.5">
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dotTone(projectColor))} />
        <span className="truncate">{project}</span>
      </span>,
    );
  }
  if (area) {
    parts.push(
      <span key="area" className="truncate">
        {area}
      </span>,
    );
  }

  return (
    <span className={cn("ladder", onDark && "text-accent-deep-ink/75", className)}>
      {parts.map((part, index) => (
        <span key={index} className="contents">
          {index > 0 && <IconArrowRight className={cn(onDark && "text-accent-deep-ink/40")} />}
          {part}
        </span>
      ))}
    </span>
  );
}

export function EmptyState({
  title,
  hint,
  action,
  compact = false,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-2 px-4 text-center", compact ? "py-4" : "py-8")}>
      <p className="text-sm font-semibold text-ink">{title}</p>
      {hint && <p className="max-w-sm text-xs leading-relaxed text-muted">{hint}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  eyebrow,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <p className="text-sm font-semibold text-muted">{eyebrow}</p>}
        <h1 className="text-3xl font-extrabold tracking-tight text-ink lg:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Segmented control made of links — for server components. */
export function SegLinks({
  items,
  value,
  className,
}: {
  items: { key: string; label: ReactNode; href: string }[];
  value: string;
  className?: string;
}) {
  return (
    <div className={cn("seg", className)}>
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          aria-current={value === item.key ? "page" : undefined}
          className={cn("seg-btn", value === item.key && "seg-on")}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}
