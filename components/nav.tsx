"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  IconCalendar, IconLayers, IconMore, IconNote, IconReview, IconSettings,
  IconTarget, IconTask, IconToday, IconWarning, IconX,
} from "./icons";
import { cn } from "@/lib/util";

export interface NavCounts {
  inbox: number;
  today: number;
  overdue: number;
}

type NavItem = {
  href: "/" | "/tasks" | "/calendar" | "/notes" | "/projects" | "/strategy" | "/review" | "/settings";
  label: string;
  Icon: (props: { className?: string }) => React.ReactElement;
  badge?: "today" | "inbox";
};

const NAV: NavItem[] = [
  { href: "/", label: "Today", Icon: IconToday, badge: "today" },
  { href: "/tasks", label: "Tasks", Icon: IconTask, badge: "inbox" },
  { href: "/calendar", label: "Calendar", Icon: IconCalendar },
  { href: "/notes", label: "Notes", Icon: IconNote },
  { href: "/projects", label: "Projects", Icon: IconTarget },
  { href: "/strategy", label: "Strategy", Icon: IconLayers },
  { href: "/review", label: "Review", Icon: IconReview },
];

/* The phone gets four tabs plus "More" for the rest. */
const TABS = NAV.slice(0, 4);
const MORE: NavItem[] = [
  ...NAV.slice(4),
  { href: "/settings", label: "Settings", Icon: IconSettings },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function badgeFor(item: NavItem, counts: NavCounts) {
  return item.badge === "today" ? counts.today : item.badge === "inbox" ? counts.inbox : 0;
}

export function Wordmark({ onClick, compact = false }: { onClick?: () => void; compact?: boolean }) {
  return (
    <Link href="/" onClick={onClick} className="flex items-center gap-2.5" aria-label="Growly home">
      <span
        className={cn(
          "flex items-center justify-center rounded-inner bg-accent font-extrabold text-accent-ink",
          compact ? "h-8 w-8 text-sm" : "h-10 w-10 text-lg",
        )}
      >
        G
      </span>
      {!compact && <span className="text-lg font-extrabold tracking-tight">Growly</span>}
    </Link>
  );
}

/** Permanent icon rail from `lg` up. */
export function Rail({ counts }: { counts: NavCounts }) {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-screen w-24 shrink-0 flex-col items-center gap-1.5 px-2 pt-6 pb-5 lg:flex">
      <div className="mb-4">
        <Wordmark compact />
      </div>
      <nav aria-label="Main" className="flex flex-col items-center gap-1.5">
        {NAV.map((item) => {
          const active = isActive(pathname, item.href);
          const count = badgeFor(item, counts);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn("rail-item", active && "rail-on")}
            >
              <item.Icon />
              {item.label}
              {count > 0 && (
                <span className="rail-badge">
                  {count}
                  <span className="sr-only"> {item.badge === "inbox" ? "in inbox" : "scheduled today"}</span>
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {counts.overdue > 0 && (
        <Link
          href="/tasks?bucket=overdue"
          className="mt-3 flex h-10 w-16 flex-col items-center justify-center rounded-inner bg-danger/10 text-[11px] font-bold text-danger transition hover:bg-danger/15"
          title={`${counts.overdue} overdue`}
        >
          <IconWarning className="h-4 w-4" />
          {counts.overdue} late
        </Link>
      )}

      <Link
        href="/settings"
        aria-current={pathname.startsWith("/settings") ? "page" : undefined}
        className={cn("rail-item mt-auto", pathname.startsWith("/settings") && "rail-on")}
      >
        <IconSettings />
        Settings
      </Link>
    </aside>
  );
}

/** Bottom tab bar below `lg`, with a "More" sheet for the rest of the app. */
export function BottomNav({ counts }: { counts: NavCounts }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const moreActive = MORE.some((item) => isActive(pathname, item.href));

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sheetRef.current?.querySelector<HTMLElement>("a, button")?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      triggerRef.current?.focus();
    };
  }, [open]);

  return (
    <>
      <nav aria-label="Main" className="bottom-nav">
        <div className="flex items-stretch">
          {TABS.map((item) => {
            const active = isActive(pathname, item.href);
            const count = badgeFor(item, counts);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn("tab-item", active && "tab-on")}
              >
                <item.Icon />
                {item.label}
                {count > 0 && (
                  <span className="tab-badge">
                    {count}
                    <span className="sr-only"> {item.badge === "inbox" ? "in inbox" : "scheduled today"}</span>
                  </span>
                )}
              </Link>
            );
          })}
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setOpen(true)}
            className={cn("tab-item", moreActive && "tab-on")}
            aria-haspopup="dialog"
            aria-expanded={open}
          >
            <IconMore />
            More
            {counts.overdue > 0 && (
              <span className="tab-badge bg-danger text-white">
                {counts.overdue}
                <span className="sr-only"> overdue</span>
              </span>
            )}
          </button>
        </div>
      </nav>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 h-full w-full cursor-default bg-ink/30 backdrop-blur-[2px]"
          />
          <div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label="More"
            className="absolute inset-x-0 bottom-0 rounded-t-[24px] border-t border-line bg-surface px-4 pt-3 pb-[calc(16px+env(safe-area-inset-bottom))] shadow-[var(--shadow)]"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line-strong" aria-hidden />
            <div className="mb-2 flex items-center justify-between">
              <Wordmark onClick={() => setOpen(false)} />
              <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost btn-icon" aria-label="Close menu">
                <IconX />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {MORE.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-14 items-center gap-3 rounded-inner px-4 text-sm font-semibold transition",
                      active ? "bg-surface-3 text-ink" : "bg-surface-2 text-muted hover:text-ink",
                    )}
                  >
                    <item.Icon className={cn("h-5 w-5", active && "text-accent")} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
            {counts.overdue > 0 && (
              <Link
                href="/tasks?bucket=overdue"
                onClick={() => setOpen(false)}
                className="mt-2 flex h-12 items-center justify-center gap-2 rounded-inner bg-danger/10 text-sm font-semibold text-danger"
              >
                <IconWarning className="h-4 w-4" />
                {counts.overdue} overdue {counts.overdue === 1 ? "task" : "tasks"}
              </Link>
            )}
          </div>
        </div>
      )}
    </>
  );
}
