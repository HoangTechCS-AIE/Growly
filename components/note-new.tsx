"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createNote, ensureDailyNote } from "@/lib/actions";
import { NOTE_TEMPLATES } from "@/lib/markdown";
import { todayISO } from "@/lib/util";
import { IconChevronDown, IconPlus } from "./icons";

export function NewNoteButtons({ projectId, goalId }: { projectId?: string; goalId?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", dismiss);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", dismiss);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function create(title: string, content: string, kind: string) {
    setOpen(false);
    startTransition(async () => {
      const id = await createNote({
        title,
        content,
        kind,
        project_id: projectId ?? null,
        goal_id: goalId ?? null,
      });
      router.push(`/notes/${id}`);
    });
  }

  return (
    <div ref={menuRef} className="relative flex items-center gap-2">
      <button
        type="button"
        className="btn btn-outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const id = await ensureDailyNote(todayISO());
            router.push(`/notes/${id}`);
          })
        }
      >
        Daily note
      </button>

      <button
        type="button"
        className="btn btn-outline"
        onClick={() => setOpen((o) => !o)}
        disabled={pending}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        From template
        <IconChevronDown className="h-4 w-4" />
      </button>

      <button
        type="button"
        className="btn btn-primary"
        disabled={pending}
        onClick={() => create("Untitled note", "", "quick")}
      >
        <IconPlus className="h-4 w-4" />
        New note
      </button>

      {open && (
        <div
          role="menu"
          className="absolute top-full right-0 z-40 mt-2 w-60 rounded-[16px] border border-line bg-surface p-1.5 shadow-[var(--shadow)]"
        >
          {NOTE_TEMPLATES.map((template) => (
            <button
              key={template.key}
              type="button"
              role="menuitem"
              onClick={() => create(template.title, template.content, template.key === "meeting" ? "meeting" : "template")}
              className="block w-full cursor-pointer rounded-[10px] px-3 py-2 text-left text-sm font-medium text-ink transition hover:bg-surface-2"
            >
              {template.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
