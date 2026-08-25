"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  IconCalendar, IconNote, IconReview, IconSettings, IconTarget, IconTask, IconToday,
} from "./icons";
import { cn } from "@/lib/util";

export interface NavCounts {
  inbox: number;
  today: number;
  overdue: number;
}

type NavItem = {
  href: "/" | "/tasks" | "/calendar" | "/notes" | "/projects" | "/review";
  label: string;
  Icon: (props: { className?: string }) => React.ReactElement;
  badge?: "today" | "inbox";
};

const NAV: NavItem[] = [
  { href: "/", label: "Today", Icon: IconToday, badge: "today" },
  { href: "/tasks", label: "Tasks", Icon: IconTask, badge: "inbox" },
  { href: "/calendar", label: "Calendar", Icon: IconCalendar },
  { href: "/notes", label: "Notes", Icon: IconNote },
  { href: "/projects", label: "My projects", Icon: IconTarget },
  { href: "/review", label: "Review", Icon: IconReview },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function NavList({ counts, onNavigate }: { counts: NavCounts; onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <>
      <nav aria-label="Main" className="flex flex-col gap-0.5">
        {NAV.map(({ href, label, Icon, badge }) => {
          const active = isActive(pathname, href);
          const count = badge === "today" ? counts.today : badge === "inbox" ? counts.inbox : 0;
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-10 items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition",
                active ? "bg-surface-3 text-ink" : "text-muted hover:bg-surface-2 hover:text-ink",
              )}
            >
              <Icon className={active ? "text-accent" : ""} />
              <span className="flex-1">{label}</span>
              {count > 0 && (
                <span className="rounded-md bg-surface-3 px-1.5 py-0.5 text-[11px] text-muted">
                  {count}
                  <span className="sr-only"> {badge === "inbox" ? "in inbox" : "scheduled today"}</span>
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {counts.overdue > 0 && (
        <Link
          href="/tasks?bucket=overdue"
          onClick={onNavigate}
          className="mt-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[12px] text-danger transition hover:bg-danger/15"
        >
          {counts.overdue} overdue {counts.overdue === 1 ? "task" : "tasks"}
        </Link>
      )}

      <div className="mt-auto flex flex-col gap-0.5 pt-4">
        <Link
          href="/settings"
          onClick={onNavigate}
          aria-current={pathname.startsWith("/settings") ? "page" : undefined}
          className={cn(
            "flex min-h-10 items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition",
            pathname.startsWith("/settings")
              ? "bg-surface-3 text-ink"
              : "text-muted hover:bg-surface-2 hover:text-ink",
          )}
        >
          <IconSettings />
          Settings
        </Link>
        <p className="px-2.5 pt-2 text-[11px] leading-relaxed text-muted/80">
          Strategy → today.
          <br />
          Local-first, stored on this machine.
        </p>
      </div>
    </>
  );
}

export function Wordmark({ onClick }: { onClick?: () => void }) {
  return (
    <Link href="/" onClick={onClick} className="flex items-center gap-2 px-2 py-1">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-[15px] font-bold text-accent-ink">
        G
      </span>
      <span className="text-[15px] font-semibold tracking-tight">Growly</span>
    </Link>
  );
}

/** Permanent rail from `lg` up. */
export function Sidebar({ counts }: { counts: NavCounts }) {
  return (
    <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-line bg-surface/60 px-3 py-4 lg:flex">
      <div className="mb-5">
        <Wordmark />
      </div>
      <NavList counts={counts} />
    </aside>
  );
}

/** Trigger + slide-over used below `lg`. */
export function MobileNav({ counts }: { counts: NavCounts }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.querySelector<HTMLElement>("a, button")?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      triggerRef.current?.focus();
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="btn btn-sm lg:hidden"
        aria-label="Open navigation"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
            className="absolute inset-0 h-full w-full cursor-default bg-canvas/70 backdrop-blur-[2px]"
          />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="absolute inset-y-0 left-0 flex w-64 max-w-[85vw] flex-col border-r border-line bg-surface px-3 py-4 shadow-2xl"
          >
            <div className="mb-5 flex items-center justify-between">
              <Wordmark onClick={() => setOpen(false)} />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="btn btn-sm btn-ghost"
                aria-label="Close navigation"
              >
                ✕
              </button>
            </div>
            <NavList counts={counts} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
