"use client";

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  archiveNote, createChildNote, deleteNote, noteLineToTask, setNoteAppearance, toggleNotePin,
  updateNote,
} from "@/lib/actions";
import { createDatabase } from "@/lib/database";
import { BlockEditor } from "./block-editor";
import { IconArchive, IconImage, IconNote, IconPin, IconSliders, IconSmile, IconTrash } from "./icons";
import {
  NOTE_COVERS, NOTE_KIND_LABEL, coverCss,
  type NoteKind, type NoteTreeItem, type NoteView, type ProjectView,
} from "@/lib/types";
import { cn } from "@/lib/util";

const EMOJI = [
  "📄", "📝", "📌", "🚀", "🎯", "💡", "🔥", "⭐", "✅", "📊",
  "📅", "🧠", "🛠️", "🔍", "📚", "💬", "🏗️", "🌱", "⚡", "🧭",
  "🎨", "💰", "🤝", "🧪", "🏁", "🕹️", "☕", "🌍", "🔒", "🎧",
];

export function NotePage({
  note, ancestors, subpages, backlinks, outlinks, projects, noteIndex,
}: {
  note: NoteView;
  ancestors: { id: string; title: string; icon: string | null }[];
  subpages: NoteTreeItem[];
  backlinks: { id: string; title: string; icon: string | null }[];
  outlinks: { id: string; title: string; icon: string | null }[];
  projects: ProjectView[];
  noteIndex: { id: string; title: string; icon: string | null }[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showCover, setShowCover] = useState(false);
  const [showProps, setShowProps] = useState(
    Boolean(note.project_id || note.goal_id || note.tags.length || note.kind !== "quick"),
  );
  const [form, setForm] = useState({
    title: note.title,
    content: note.content,
    kind: note.kind as NoteKind,
    project_id: note.project_id ?? "",
    goal_id: note.goal_id ?? "",
    tags: note.tags.map((tag) => tag.name).join(", "),
  });
  const formRef = useRef(form);
  formRef.current = form;
  // The title is a textarea so long names wrap on a phone; it grows to fit.
  const titleRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [form.title]);

  // A different page arrived through the same component instance.
  const loadedId = useRef(note.id);
  useEffect(() => {
    if (loadedId.current === note.id) return;
    loadedId.current = note.id;
    setDirty(false);
    setForm({
      title: note.title,
      content: note.content,
      kind: note.kind as NoteKind,
      project_id: note.project_id ?? "",
      goal_id: note.goal_id ?? "",
      tags: note.tags.map((tag) => tag.name).join(", "),
    });
  }, [note]);

  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => {
      setSaving(true);
      const snapshot = formRef.current;
      startTransition(async () => {
        await updateNote(note.id, {
          title: snapshot.title.trim() || "Untitled",
          content: snapshot.content,
          kind: snapshot.kind,
          project_id: snapshot.project_id || null,
          goal_id: snapshot.goal_id || null,
          tags: snapshot.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        });
        setDirty(false);
        setSaving(false);
        router.refresh();
      });
    }, 700);
    return () => clearTimeout(timer);
  }, [dirty, form, note.id, router]);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setDirty(true);
  }

  const appearance = (patch: { icon?: string | null; cover?: string | null }) =>
    startTransition(async () => {
      await setNoteAppearance(note.id, patch);
      router.refresh();
    });

  const cover = coverCss(note.cover);

  return (
    <div className="np-page">
      {cover && (
        <div className="np-cover group" style={{ backgroundImage: cover }}>
          <div className="np-cover-actions row-actions">
            <button type="button" className="btn btn-sm bg-surface/90 backdrop-blur" onClick={() => setShowCover((open) => !open)}>
              Change cover
            </button>
            <button type="button" className="btn btn-sm bg-surface/90 backdrop-blur" onClick={() => appearance({ cover: null })}>
              Remove
            </button>
          </div>
          {showCover && (
            <div className="np-cover-picker">
              {NOTE_COVERS.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  title={preset.label}
                  aria-label={preset.label}
                  style={{ backgroundImage: preset.css }}
                  onClick={() => {
                    appearance({ cover: preset.key });
                    setShowCover(false);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="np-body">
        <nav className="np-breadcrumb" aria-label="Breadcrumb">
          <Link href="/notes">Notes</Link>
          {ancestors.map((ancestor) => (
            <span key={ancestor.id}>
              <span className="np-crumb-sep">/</span>
              <Link href={`/notes/${ancestor.id}`}>
                {ancestor.icon ? `${ancestor.icon} ` : ""}
                {ancestor.title}
              </Link>
            </span>
          ))}
          <span className="np-crumb-sep">/</span>
          <span className="np-crumb-current">{form.title || "Untitled"}</span>

          <span className="ml-auto flex items-center gap-1.5">
            <span className="text-xs font-semibold text-muted" aria-live="polite">
              {saving ? "Saving…" : dirty ? "Unsaved" : "Saved"}
            </span>
            <button
              type="button"
              className={cn("btn btn-ghost btn-icon btn-sm", note.pinned === 1 && "text-warn")}
              title={note.pinned === 1 ? "Unpin" : "Pin"}
              onClick={() =>
                startTransition(async () => {
                  await toggleNotePin(note.id);
                  router.refresh();
                })
              }
            >
              <IconPin className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-icon btn-sm"
              title={note.archived === 1 ? "Unarchive" : "Archive"}
              onClick={() =>
                startTransition(async () => {
                  await archiveNote(note.id, note.archived === 0);
                  router.refresh();
                })
              }
            >
              <IconArchive className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-icon btn-sm btn-danger"
              title="Delete page"
              onClick={() => {
                const warning = subpages.length
                  ? `Delete this page and its ${subpages.length} sub-page(s)?`
                  : "Delete this page permanently?";
                if (!confirm(warning)) return;
                startTransition(async () => {
                  await deleteNote(note.id);
                  router.push(note.parent_id ? `/notes/${note.parent_id}` : "/notes");
                });
              }}
            >
              <IconTrash className="h-4 w-4" />
            </button>
          </span>
        </nav>

        <div className="np-add-row row-actions">
          {!note.icon && (
            <button type="button" className="np-add-btn" onClick={() => setShowEmoji(true)}>
              <IconSmile />
              Add icon
            </button>
          )}
          {!cover && (
            <button
              type="button"
              className="np-add-btn"
              onClick={() => appearance({ cover: NOTE_COVERS[0].key })}
            >
              <IconImage />
              Add cover
            </button>
          )}
          <button type="button" className="np-add-btn" onClick={() => setShowProps((open) => !open)}>
            <IconSliders />
            {showProps ? "Hide" : "Show"} properties
          </button>
        </div>

        <div className="np-title-row">
          {note.icon && (
            <button
              type="button"
              className="np-icon"
              title="Change icon"
              onClick={() => setShowEmoji((open) => !open)}
            >
              {note.icon}
            </button>
          )}
          <textarea
            ref={titleRef}
            value={form.title}
            rows={1}
            onChange={(event) => set("title", event.target.value.replace(/\n/g, " "))}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.preventDefault();
            }}
            className="np-title"
            placeholder="Untitled"
            aria-label="Page title"
          />
        </div>

        {showEmoji && (
          <div className="np-emoji-picker">
            {EMOJI.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  appearance({ icon: emoji });
                  setShowEmoji(false);
                }}
              >
                {emoji}
              </button>
            ))}
            <button
              type="button"
              className="np-emoji-clear"
              onClick={() => {
                appearance({ icon: null });
                setShowEmoji(false);
              }}
            >
              Remove
            </button>
          </div>
        )}

        {showProps && (
          <div className="np-props">
            <label className="np-prop">
              <span>Type</span>
              <select value={form.kind} onChange={(event) => set("kind", event.target.value as NoteKind)}>
                {Object.entries(NOTE_KIND_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="np-prop">
              <span>Project</span>
              <select value={form.project_id} onChange={(event) => set("project_id", event.target.value)}>
                <option value="">Empty</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="np-prop">
              <span>Tags</span>
              <input
                value={form.tags}
                onChange={(event) => set("tags", event.target.value)}
                placeholder="comma separated"
              />
            </label>
          </div>
        )}

        <BlockEditor
          key={note.id}
          value={form.content}
          onChange={(markdown) => set("content", markdown)}
          noteIndex={noteIndex}
          storageKey={note.id}
          onCreateSubpage={async (title) => {
            const id = await createChildNote(note.id, title);
            router.refresh();
            return id ? { id, title } : null;
          }}
          embedContext={{
            projectId: form.project_id || null,
            projects,
          }}
          onCreateDatabase={async () => {
            const id = await createDatabase(note.id);
            router.refresh();
            return id;
          }}
          onBlockToTask={async (line) => {
            await noteLineToTask(note.id, line, { project_id: form.project_id || null });
            router.refresh();
          }}
        />

        <div className="np-footer">
          <section>
            <h2 className="tile-title">Sub-pages</h2>
            {subpages.length ? (
              <ul className="np-links">
                {subpages.map((child) => (
                  <li key={child.id}>
                    <Link href={`/notes/${child.id}`}>
                      <span aria-hidden>{child.icon || <IconNote />}</span>
                      {child.title || "Untitled"}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="np-empty">
                No sub-pages.{" "}
                <button
                  type="button"
                  className="link"
                  onClick={() =>
                    startTransition(async () => {
                      const id = await createChildNote(note.id);
                      router.push(`/notes/${id}`);
                    })
                  }
                >
                  Add one
                </button>
                , or type <code>/page</code> in the editor.
              </p>
            )}
          </section>

          <section>
            <h2 className="tile-title">Backlinks</h2>
            {backlinks.length ? (
              <ul className="np-links">
                {backlinks.map((item) => (
                  <li key={item.id}>
                    <Link href={`/notes/${item.id}`}>
                      <span aria-hidden>{item.icon || <IconNote />}</span>
                      {item.title}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="np-empty">
                Write <code>[[{form.title || "this page"}]]</code> in another page to link here.
              </p>
            )}
          </section>

          {outlinks.length > 0 && (
            <section>
              <h2 className="tile-title">Links out</h2>
              <ul className="np-links">
                {outlinks.map((item) => (
                  <li key={item.id}>
                    <Link href={`/notes/${item.id}`}>
                      <span aria-hidden>{item.icon || <IconNote />}</span>
                      {item.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <p className="np-hint">
          Type <span>/</span> for blocks, <span>[[</span> to link a page, <span>Tab</span> to indent a
          list. Drag <span>⠿</span> to move a block, or click it to send the line to Tasks.
        </p>
      </div>
    </div>
  );
}
