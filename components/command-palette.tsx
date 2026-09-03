"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recentTargets, searchCommand } from "@/lib/actions";
import { quickAdd } from "@/lib/quickadd";
import { snippetParts, type SearchHit } from "@/lib/types";
import { cn } from "@/lib/util";
import { IconNote, IconPlus, IconSearch, IconTarget, IconTask } from "./icons";

const KIND_LABEL: Record<SearchHit["kind"], string> = {
  note: "Page",
  task: "Task",
  project: "Project",
  goal: "Goal",
};

const KIND_ICON: Record<SearchHit["kind"], (p: { className?: string }) => React.ReactElement> = {
  note: IconNote,
  task: IconTask,
  project: IconTarget,
  goal: IconTarget,
};

/** Snippets arrive with matched runs fenced by control characters, never HTML. */
function Snippet({ text }: { text: string }) {
  if (!text) return null;
  const parts = snippetParts(text);
  return (
    <span className="cp-snippet">
      {parts.map((part, index) =>
        part.hit ? (
          <mark key={index}>{part.text}</mark>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </span>
  );
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const requestId = useRef(0);

  const trimmed = query.trim();
  // With nothing found, the palette still offers to capture what you typed.
  const canQuickAdd = trimmed.length > 1;
  const total = hits.length + (canQuickAdd ? 1 : 0);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
    }
    // Buttons in the top bar and the `/` shortcut open it through this event.
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("growly:palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("growly:palette", onOpen);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    const timer = setTimeout(() => inputRef.current?.focus(), 20);
    return () => clearTimeout(timer);
  }, [open]);

  /* Debounced so a fast typist does not queue a request per keystroke. */
  useEffect(() => {
    if (!open) return;
    const ticket = ++requestId.current;
    setBusy(true);
    const timer = setTimeout(async () => {
      const results = trimmed ? await searchCommand(trimmed) : await recentTargets();
      if (ticket !== requestId.current) return;
      setHits(results);
      setActive(0);
      setBusy(false);
    }, trimmed ? 120 : 0);
    return () => clearTimeout(timer);
  }, [open, trimmed]);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  const capture = useCallback(() => {
    const text = trimmed;
    if (!text) return;
    setOpen(false);
    startTransition(async () => {
      await quickAdd(text);
      router.refresh();
    });
  }, [trimmed, router]);

  const choose = (index: number) => {
    if (index < hits.length) go(hits[index].href);
    else capture();
  };

  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  if (!open) return null;

  return (
    <div
      className="cp-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <div className="cp-panel" role="dialog" aria-modal="true" aria-label="Search and commands">
        <div className="cp-input">
          <IconSearch className="h-5 w-5 shrink-0 text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search pages, tasks, projects — or type a new task"
            aria-label="Search everything"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setOpen(false);
              } else if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive((index) => (total ? (index + 1) % total : 0));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((index) => (total ? (index - 1 + total) % total : 0));
              } else if (event.key === "Enter") {
                event.preventDefault();
                if (total) choose(active);
              }
            }}
          />
          {busy && <span className="cp-busy" aria-hidden />}
        </div>

        <div ref={listRef} className="cp-list">
          {!trimmed && hits.length > 0 && <p className="cp-heading">Recent pages</p>}

          {hits.map((hit, index) => {
            const Icon = KIND_ICON[hit.kind];
            return (
              <button
                key={`${hit.kind}-${hit.id}`}
                type="button"
                data-index={index}
                className={cn("cp-item", index === active && "cp-item-active")}
                onMouseEnter={() => setActive(index)}
                onClick={() => go(hit.href)}
              >
                <span className="cp-icon" aria-hidden>
                  {hit.icon ? hit.icon : <Icon />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="cp-title">{hit.title || "Untitled"}</span>
                  <Snippet text={hit.snippet} />
                </span>
                <span className="cp-meta">
                  {hit.context && <span className="cp-context">{hit.context}</span>}
                  <span className="tag">{KIND_LABEL[hit.kind]}</span>
                </span>
              </button>
            );
          })}

          {trimmed && !busy && hits.length === 0 && (
            <p className="cp-empty">No matches for “{trimmed}”.</p>
          )}

          {canQuickAdd && (
            <button
              type="button"
              data-index={hits.length}
              className={cn("cp-item", active === hits.length && "cp-item-active")}
              onMouseEnter={() => setActive(hits.length)}
              onClick={capture}
            >
              <span className="cp-icon text-accent" aria-hidden>
                <IconPlus />
              </span>
              <span className="min-w-0 flex-1">
                <span className="cp-title">Add task “{trimmed}”</span>
                <span className="cp-snippet">
                  Quick-add syntax works here: @project ~goal #tag today 14:00 45m
                </span>
              </span>
            </button>
          )}
        </div>

        <div className="cp-footer">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> move
          </span>
          <span>
            <kbd>↵</kbd> open
          </span>
          <span>
            <kbd>Esc</kbd> close
          </span>
          <span className="ml-auto">
            <kbd>/</kbd> or <kbd>⌘K</kbd> opens this anywhere
          </span>
        </div>
      </div>
    </div>
  );
}
