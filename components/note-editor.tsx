"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { archiveNote, deleteNote, noteLineToTask, toggleNotePin, updateNote } from "@/lib/actions";
import { renderMarkdown } from "@/lib/markdown";
import { NOTE_KIND_LABEL, type GoalView, type NoteKind, type NoteView, type ProjectView } from "@/lib/types";
import { cn } from "@/lib/util";
import { IconArchive, IconPin, IconTask, IconTrash } from "./icons";

const MODES = ["write", "split", "read"] as const;

export function NoteEditor({
  note,
  projects,
  goals,
  noteIndex,
}: {
  note: NoteView;
  projects: ProjectView[];
  goals: GoalView[];
  noteIndex: { id: string; title: string }[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mode, setMode] = useState<(typeof MODES)[number]>("split");
  const [flash, setFlash] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: note.title,
    content: note.content,
    kind: note.kind as NoteKind,
    project_id: note.project_id ?? "",
    goal_id: note.goal_id ?? "",
    tags: note.tags.map((t) => t.name).join(", "),
  });

  const links = useMemo(
    () => new Map(noteIndex.map((n) => [n.title.toLowerCase(), n.id])),
    [noteIndex],
  );
  const html = useMemo(() => renderMarkdown(form.content, links), [form.content, links]);

  // Autosave shortly after typing stops.
  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => {
      setSaving(true);
      startTransition(async () => {
        await updateNote(note.id, {
          title: form.title.trim() || "Untitled note",
          content: form.content,
          kind: form.kind,
          project_id: form.project_id || null,
          goal_id: form.goal_id || null,
          tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
        });
        setDirty(false);
        setSaving(false);
        router.refresh();
      });
    }, 700);
    return () => clearTimeout(timer);
  }, [dirty, form, note.id, router]);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
  }

  function selectedLines(): string[] {
    const el = textareaRef.current;
    if (!el) return [];
    const { selectionStart, selectionEnd, value } = el;
    const start = value.lastIndexOf("\n", Math.max(0, selectionStart - 1)) + 1;
    const endIndex = value.indexOf("\n", selectionEnd);
    const end = endIndex === -1 ? value.length : endIndex;
    return value
      .slice(start, end)
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  }

  function convertToTasks() {
    const lines = selectedLines();
    if (!lines.length) {
      setFlash("Put the cursor on a line first");
      setTimeout(() => setFlash(null), 2000);
      return;
    }
    startTransition(async () => {
      for (const line of lines) {
        await noteLineToTask(note.id, line, {
          project_id: form.project_id || null,
          goal_id: form.goal_id || null,
        });
      }
      setFlash(`${lines.length} task${lines.length > 1 ? "s" : ""} created`);
      setTimeout(() => setFlash(null), 2500);
      router.refresh();
    });
  }

  return (
    <div className="flex min-h-[70vh] flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={form.title}
          onChange={(e) => set("title", e.target.value)}
          className="input flex-1 text-[15px] font-semibold"
          placeholder="Note title"
        />
        <span className="text-[11px] text-muted" aria-live="polite">
          {saving ? "Saving…" : dirty ? "Unsaved" : "Saved"}
        </span>
        <button
          type="button"
          className={cn("btn btn-sm", note.pinned === 1 && "text-warn")}
          title={note.pinned === 1 ? "Unpin" : "Pin"}
          onClick={() =>
            startTransition(async () => {
              await toggleNotePin(note.id);
              router.refresh();
            })
          }
        >
          <IconPin className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className="btn btn-sm"
          title={note.archived === 1 ? "Unarchive" : "Archive"}
          onClick={() =>
            startTransition(async () => {
              await archiveNote(note.id, note.archived === 0);
              router.refresh();
            })
          }
        >
          <IconArchive className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className="btn btn-sm text-danger"
          title="Delete note"
          onClick={() => {
            if (confirm("Delete this note permanently?")) {
              startTransition(async () => {
                await deleteNote(note.id);
                router.push("/notes");
              });
            }
          }}
        >
          <IconTrash className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={form.kind}
          onChange={(e) => set("kind", e.target.value as NoteKind)}
          aria-label="Note type"
          className="input w-auto max-w-[45vw] py-1.5"
        >
          {Object.entries(NOTE_KIND_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={form.project_id}
          onChange={(e) => set("project_id", e.target.value)}
          aria-label="Linked project"
          className="input w-auto max-w-[45vw] py-1.5"
        >
          <option value="">No project</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.title}
            </option>
          ))}
        </select>
        <select
          value={form.goal_id}
          onChange={(e) => set("goal_id", e.target.value)}
          aria-label="Linked goal"
          className="input w-auto max-w-[45vw] py-1.5"
        >
          <option value="">No goal</option>
          {goals.map((goal) => (
            <option key={goal.id} value={goal.id}>
              {goal.title}
            </option>
          ))}
        </select>
        <input
          value={form.tags}
          onChange={(e) => set("tags", e.target.value)}
          placeholder="tags, comma separated"
          aria-label="Tags"
          className="input w-40 py-1.5 sm:w-48"
        />

        <div className="ml-auto flex items-center gap-2">
          {flash && <span className="text-[11.5px] text-accent">{flash}</span>}
          <button type="button" onClick={convertToTasks} className="btn btn-sm">
            <IconTask className="h-3.5 w-3.5" />
            Line → task
          </button>
          <div className="flex rounded-lg border border-line bg-surface p-0.5">
            {MODES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                className={cn(
                  "rounded-[7px] px-2 py-1 text-[12px] capitalize transition cursor-pointer",
                  mode === m ? "bg-surface-3 text-ink" : "text-muted hover:text-ink",
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div
        className={cn(
          "grid min-h-[60vh] flex-1 gap-3",
          mode === "split" ? "lg:grid-cols-2" : "grid-cols-1",
        )}
      >
        {mode !== "read" && (
          <textarea
            ref={textareaRef}
            value={form.content}
            onChange={(e) => set("content", e.target.value)}
            spellCheck={false}
            placeholder={"Write in Markdown.\n\n- [ ] a line like this becomes a task\n[[Another note]] creates a backlink"}
            className="card min-h-[60vh] w-full resize-none p-4 font-mono text-[13px] leading-relaxed text-ink outline-none focus:border-line-strong"
          />
        )}
        {mode !== "write" && (
          <div className="card overflow-y-auto p-4">
            <div className="prose-note" dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        )}
      </div>

      <p className="text-[11px] text-muted">
        Select one or more lines and press <span className="text-ink">Line → task</span> to turn
        them into tasks that keep this note&apos;s project and goal.{" "}
        <Link href="/notes" className="link">
          All notes
        </Link>
      </p>
    </div>
  );
}
