"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { quickAdd } from "@/lib/quickadd";
import type { Area, ProjectView } from "@/lib/types";
import { IconPlus, IconSearch } from "./icons";
import { Wordmark } from "./nav";
import { ThemeToggle } from "./theme-toggle";
import { formatDateLong, todayISO } from "@/lib/util";

const SYNTAX = [
  ["@project", "link to a project"],
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

/** Opens the command palette from anywhere. */
export function openPalette() {
  window.dispatchEvent(new CustomEvent("growly:palette"));
}

export function Topbar({
  areas,
  projects,
}: {
  areas: Area[];
  projects: ProjectView[];
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [hint, setHint] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      // Contenteditable counts as typing too, or `/` would steal the note
      // editor's block menu.
      const typing =
        target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable);
      // Cmd/Ctrl+K belongs to the command palette, which can quick-add too.
      if (event.key === "/" && !typing) {
        event.preventDefault();
        openPalette();
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
    <header className="sticky top-0 z-30 bg-canvas/85 px-4 pt-3 pb-2 backdrop-blur sm:px-6 lg:px-8 lg:pt-6 lg:pb-3">
      <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:gap-3">
        <div className="flex items-center gap-2 lg:hidden">
          <Wordmark />
          <div className="ml-auto flex items-center gap-1.5">
            <button type="button" onClick={openPalette} className="btn btn-outline btn-icon" aria-label="Search">
              <IconSearch className="h-[18px] w-[18px]" />
            </button>
            <ThemeToggle />
          </div>
        </div>

        <form onSubmit={submit} className="relative min-w-0 flex-1 lg:max-w-[720px]">
          <label htmlFor="quick-add" className="sr-only">
            Quick add a task
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted">
              <IconPlus className="h-[18px] w-[18px]" />
            </span>
            <input
              id="quick-add"
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onFocus={() => setHint(true)}
              onBlur={() => setTimeout(() => setHint(false), 150)}
              placeholder="Quick add — Draft hero copy @Landing * today 14:00 45m"
              className="input h-11 rounded-full border-line bg-surface pr-24 pl-11 shadow-[0_1px_2px_rgb(23_27_31/0.04)]"
              disabled={pending}
              aria-describedby="quick-add-hint"
              autoComplete="off"
            />
            <div className="absolute top-1/2 right-1.5 flex -translate-y-1/2 items-center gap-2">
              <span className="hidden text-xs font-semibold text-accent lg:inline" aria-hidden="true">
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
              className="absolute top-full left-0 z-40 mt-2 w-[min(460px,calc(100vw-2rem))] rounded-tile border border-line bg-surface p-4 shadow-[var(--shadow)]"
            >
              <p className="tile-title mb-2">Quick-add syntax</p>
              <ul className="grid grid-cols-1 gap-1">
                {SYNTAX.map(([token, meaning]) => (
                  <li key={token} className="flex items-baseline gap-2 text-xs">
                    <code className="rounded-md bg-surface-3 px-1.5 py-0.5 font-mono text-[11px] text-accent">
                      {token}
                    </code>
                    <span className="text-muted">{meaning}</span>
                  </li>
                ))}
              </ul>
              {projects.length > 0 && (
                <p className="mt-2 border-t border-line pt-2 text-xs text-muted">
                  {projects.slice(0, 3).map((p) => `@${p.title}`).join("  ")}
                  {areas.length > 0 && `   /${areas[0].name}`}
                </p>
              )}
            </div>
          )}
        </form>

        <div className="hidden shrink-0 items-center gap-2 lg:ml-auto lg:flex">
          <span className="mr-1 text-sm font-semibold text-muted">{formatDateLong(todayISO())}</span>
          <button
            type="button"
            onClick={openPalette}
            className="btn btn-outline gap-2 pr-2 pl-3.5"
            aria-label="Search everything"
          >
            <IconSearch className="h-4 w-4 text-muted" />
            <span className="text-muted">Search</span>
            <kbd className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-muted">
              ⌘K
            </kbd>
          </button>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
