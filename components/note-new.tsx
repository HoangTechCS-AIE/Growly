"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createNote, ensureDailyNote } from "@/lib/actions";
import { NOTE_TEMPLATES } from "@/lib/markdown";
import { todayISO } from "@/lib/util";
import { IconPlus } from "./icons";

export function NewNoteButtons({ projectId, goalId }: { projectId?: string; goalId?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

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
    <div className="relative flex items-center gap-2">
      <button
        type="button"
        className="btn"
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

      <button type="button" className="btn" onClick={() => setOpen((o) => !o)} disabled={pending}>
        From template
      </button>

      <button
        type="button"
        className="btn btn-primary"
        disabled={pending}
        onClick={() => create("Untitled note", "", "quick")}
      >
        <IconPlus className="h-3.5 w-3.5" />
        New note
      </button>

      {open && (
        <div className="absolute right-0 top-full z-40 mt-2 w-56 rounded-xl border border-line bg-surface p-1 shadow-2xl shadow-black/40">
          {NOTE_TEMPLATES.map((template) => (
            <button
              key={template.key}
              type="button"
              onClick={() => create(template.title, template.content, template.key === "meeting" ? "meeting" : "template")}
              className="block w-full rounded-lg px-2.5 py-1.5 text-left text-[13px] text-muted transition hover:bg-surface-2 hover:text-ink cursor-pointer"
            >
              {template.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
