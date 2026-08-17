"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { quickAdd } from "@/lib/quickadd";
import type { Area, GoalView, ProjectView } from "@/lib/types";
import { IconPlus, IconSearch } from "./icons";
import { ThemeToggle } from "./theme-toggle";
import { formatDateLong, todayISO } from "@/lib/util";

const SYNTAX = [
  ["@project", "link to a project"],
  ["~goal", "link to a goal"],
  ["/area", "Work, Health, Learning…"],
  ["#tag", "add a tag"],
  ["*", "important"],
  ["!", "urgent"],
  ["today · tmr · fri · 20/8", "schedule the day"],
  ["due:friday", "deadline"],
  ["14:00", "start of time block"],
  ["45m · 1h30", "estimate"],
  ["every week", "repeat"],
];

export function Topbar({
  areas,
  goals,
  projects,
  nav,
}: {
  areas: Area[];
  goals: GoalView[];
  projects: ProjectView[];
  nav?: React.ReactNode;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [hint, setHint] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target && /^(INPUT|TEXTAREA)$/.test(target.tagName);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      } else if (event.key === "/" && !typing) {
        event.preventDefault();
        (searchRef.current ?? inputRef.current)?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const value = text.trim();
    if (!value) return;
    startTransition(async () => {
      const id = await quickAdd(value);
      setText("");
      setFlash(id ? "Task added" : "Nothing to add");
      setTimeout(() => setFlash(null), 2000);
      router.refresh();
    });
  }

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/90 px-3 py-2.5 backdrop-blur sm:px-5 lg:px-6 lg:py-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-3">
        <div className="flex items-center gap-2 lg:hidden">
          {nav}
          <Link href="/" className="flex items-center gap-1.5">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent text-[12px] font-bold text-accent-ink">
              G
            </span>
            <span className="text-[14px] font-semibold tracking-tight">Growly</span>
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <Link href="/search" className="btn btn-sm btn-ghost" aria-label="Search">
              <IconSearch className="h-4 w-4" />
            </Link>
            <ThemeToggle />
          </div>
        </div>

        <form onSubmit={submit} className="relative min-w-0 flex-1">
          <label htmlFor="quick-add" className="sr-only">
            Quick add a task
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted">
              <IconPlus />
            </span>
            <input
              id="quick-add"
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onFocus={() => setHint(true)}
              onBlur={() => setTimeout(() => setHint(false), 150)}
              placeholder="Quick add — Draft landing copy @Landing * today 14:00 45m"
              className="input pr-20 pl-9 lg:pr-24"
              disabled={pending}
              aria-describedby="quick-add-hint"
              autoComplete="off"
            />
            <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-2">
              <span className="hidden text-[11px] text-accent lg:inline" aria-hidden="true">
                {flash}
              </span>
              <button type="submit" className="btn btn-sm btn-primary" disabled={pending}>
                Add
              </button>
            </div>
          </div>
          <p aria-live="polite" className="sr-only">
            {flash}
          </p>

          {hint && (
            <div
              id="quick-add-hint"
              className="absolute top-full left-0 z-40 mt-2 w-[min(440px,calc(100vw-1.5rem))] rounded-xl border border-line bg-surface p-3 shadow-[var(--shadow)]"
            >
              <p className="section-title mb-2">Quick-add syntax</p>
              <ul className="grid grid-cols-1 gap-1">
                {SYNTAX.map(([token, meaning]) => (
                  <li key={token} className="flex items-baseline gap-2 text-[12px]">
                    <code className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[11px] text-accent">
                      {token}
                    </code>
                    <span className="text-muted">{meaning}</span>
                  </li>
                ))}
              </ul>
              {(projects.length > 0 || goals.length > 0) && (
                <p className="mt-2 border-t border-line pt-2 text-[11px] text-muted">
                  {projects.slice(0, 3).map((p) => `@${p.title}`).join("  ")}
                  {goals.length > 0 && "   "}
                  {goals.slice(0, 2).map((g) => `~${g.title}`).join("  ")}
                  {areas.length > 0 && `   /${areas[0].name}`}
                </p>
              )}
            </div>
          )}
        </form>

        <form action="/search" className="relative hidden w-64 lg:block" role="search">
          <label htmlFor="global-search" className="sr-only">
            Search everything
          </label>
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted">
            <IconSearch />
          </span>
          <input
            id="global-search"
            ref={searchRef}
            name="q"
            placeholder="Search everything  (/)"
            className="input pl-9"
            autoComplete="off"
          />
        </form>

        <div className="hidden shrink-0 items-center gap-1 lg:flex">
          <span className="text-[12px] text-muted">{formatDateLong(todayISO())}</span>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
