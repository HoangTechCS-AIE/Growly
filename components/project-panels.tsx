"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createNote, createProject, createTask, toggleTaskDone, updateProject,
} from "@/lib/actions";
import type { NoteView, ProjectStatus, ProjectView, TaskView } from "@/lib/types";
import { chipTone, cn, formatDuration, pct, relativeDay } from "@/lib/util";
import { IconNote, IconPlus, IconTask } from "./icons";

const STATUSES: ProjectStatus[] = ["planned", "active", "paused", "done"];
const STATUS_LABEL: Record<ProjectStatus, string> = {
  planned: "Planned",
  active: "Active",
  paused: "Paused",
  done: "Done",
};

const COLORS = ["indigo", "emerald", "amber", "rose", "sky", "violet", "teal", "orange", "slate"];

/* ------------------------------------------------------------ the index -- */

export function NewProjectButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [pending, startTransition] = useTransition();

  const create = () => {
    const clean = title.trim();
    if (!clean) return;
    startTransition(async () => {
      const id = await createProject({ title: clean, status: "active" });
      setTitle("");
      setOpen(false);
      router.push(`/projects/${id}`);
    });
  };

  if (!open) {
    return (
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
        <IconPlus className="h-3.5 w-3.5" />
        New project
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        autoFocus
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") create();
          if (event.key === "Escape") setOpen(false);
        }}
        placeholder="What is this project?"
        aria-label="Project name"
        className="input w-64"
      />
      <button type="button" className="btn btn-primary" disabled={pending} onClick={create}>
        Create
      </button>
      <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </div>
  );
}

export function ProjectCard({ project }: { project: ProjectView }) {
  const share = pct(project.task_done, project.task_total);
  return (
    <Link href={`/projects/${project.id}`} className="pj-card">
      <div className="pj-card-head">
        <span className={cn("pj-dot", `tone-${project.color}`)} aria-hidden />
        <h3 className="min-w-0 flex-1 truncate text-[14px] font-semibold">{project.title}</h3>
        <span className={chipTone(project.color)}>{STATUS_LABEL[project.status]}</span>
      </div>
      {project.description && <p className="pj-card-desc">{project.description}</p>}
      <div className="pj-bar" role="img" aria-label={`${share}% of tasks done`}>
        <span style={{ width: `${share}%` }} />
      </div>
      <p className="pj-card-meta">
        <span>
          <IconTask className="mr-1 inline h-3 w-3" />
          {project.task_done}/{project.task_total} tasks
        </span>
        <span>
          <IconNote className="mr-1 inline h-3 w-3" />
          {project.note_total} note{project.note_total === 1 ? "" : "s"}
        </span>
        {project.due_date && <span className="ml-auto">due {project.due_date}</span>}
      </p>
    </Link>
  );
}

/* ----------------------------------------------------------- the detail -- */

export function ProjectHeader({ project }: { project: ProjectView }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [form, setForm] = useState({
    title: project.title,
    description: project.description ?? "",
  });
  const [dirty, setDirty] = useState(false);

  const save = () => {
    if (!dirty) return;
    setDirty(false);
    startTransition(async () => {
      await updateProject(project.id, {
        title: form.title.trim() || "Untitled project",
        description: form.description || null,
      });
      router.refresh();
    });
  };

  const patch = (changes: Parameters<typeof updateProject>[1]) =>
    startTransition(async () => {
      await updateProject(project.id, changes);
      router.refresh();
    });

  return (
    <div className="pj-header">
      <div className="pj-header-top">
        <span className={cn("pj-dot pj-dot-lg", `tone-${project.color}`)} aria-hidden />
        <input
          value={form.title}
          onChange={(event) => {
            setForm((f) => ({ ...f, title: event.target.value }));
            setDirty(true);
          }}
          onBlur={save}
          className="pj-title"
          aria-label="Project name"
          placeholder="Untitled project"
        />
        <select
          value={project.status}
          onChange={(event) => patch({ status: event.target.value as ProjectStatus })}
          aria-label="Project status"
          className="input w-auto py-1.5"
        >
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABEL[status]}
            </option>
          ))}
        </select>
        <select
          value={project.color}
          onChange={(event) => patch({ color: event.target.value })}
          aria-label="Project colour"
          className="input w-auto py-1.5"
        >
          {COLORS.map((color) => (
            <option key={color} value={color}>
              {color}
            </option>
          ))}
        </select>
      </div>

      <textarea
        value={form.description}
        onChange={(event) => {
          setForm((f) => ({ ...f, description: event.target.value }));
          setDirty(true);
        }}
        onBlur={save}
        rows={2}
        placeholder="What is this project about?"
        aria-label="Project description"
        className="pj-desc"
      />

      <div className="pj-header-meta">
        <label>
          <span>Start</span>
          <input
            type="date"
            defaultValue={project.start_date ?? ""}
            onChange={(event) => patch({ start_date: event.target.value || null })}
          />
        </label>
        <label>
          <span>Due</span>
          <input
            type="date"
            defaultValue={project.due_date ?? ""}
            onChange={(event) => patch({ due_date: event.target.value || null })}
          />
        </label>
        <button
          type="button"
          className="btn btn-sm btn-ghost ml-auto"
          onClick={() => {
            if (confirm(`Archive “${project.title}”? Its tasks and notes stay where they are.`)) {
              startTransition(async () => {
                await updateProject(project.id, { archived: true });
                router.push("/projects");
              });
            }
          }}
        >
          Archive project
        </button>
      </div>
    </div>
  );
}

export function ProjectTasks({
  project, tasks, today,
}: {
  project: ProjectView;
  tasks: TaskView[];
  today: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [pending, startTransition] = useTransition();

  const add = () => {
    const clean = title.trim();
    if (!clean) return;
    setTitle("");
    startTransition(async () => {
      await createTask({ title: clean, project_id: project.id, status: "inbox" });
      router.refresh();
    });
  };

  const open = tasks.filter((task) => task.status !== "done");
  const done = tasks.filter((task) => task.status === "done");

  return (
    <section className="pj-section">
      <header className="pj-section-head">
        <h2 className="section-title">Tasks</h2>
        <span className="text-[11px] text-muted">
          {done.length}/{tasks.length} done
        </span>
      </header>

      <div className="pj-add">
        <IconPlus className="h-3.5 w-3.5 shrink-0 text-muted" />
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && add()}
          placeholder="Add a small task and press Enter"
          aria-label="New task in this project"
        />
        {title.trim() && (
          <button type="button" className="btn btn-sm" disabled={pending} onClick={add}>
            Add
          </button>
        )}
      </div>

      {tasks.length === 0 ? (
        <p className="pj-empty">No tasks yet. Add the first small step above.</p>
      ) : (
        <ul className="pj-list">
          {[...open, ...done].map((task) => (
            <li key={task.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={task.status === "done"}
                aria-label={`Mark "${task.title}" ${task.status === "done" ? "not done" : "done"}`}
                className={cn("nb-check", task.status === "done" && "nb-check-on")}
                onClick={() =>
                  startTransition(async () => {
                    await toggleTaskDone(task.id);
                    router.refresh();
                  })
                }
              >
                {task.status === "done" ? "✓" : ""}
              </button>
              <Link
                href={`/tasks/${task.id}`}
                className={cn("pj-item-title", task.status === "done" && "pj-item-done")}
              >
                {task.title}
              </Link>
              {task.estimate_minutes ? (
                <span className="pj-item-meta">{formatDuration(task.estimate_minutes)}</span>
              ) : null}
              {task.scheduled_date && (
                <span className="pj-item-meta">{relativeDay(task.scheduled_date, today)}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function ProjectNotes({ project, notes }: { project: ProjectView; notes: NoteView[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [pending, startTransition] = useTransition();

  const add = () => {
    const clean = title.trim() || "Untitled";
    setTitle("");
    startTransition(async () => {
      const id = await createNote({ title: clean, project_id: project.id });
      router.push(`/notes/${id}`);
    });
  };

  return (
    <section className="pj-section">
      <header className="pj-section-head">
        <h2 className="section-title">Notes</h2>
        <span className="text-[11px] text-muted">{notes.length}</span>
      </header>

      <div className="pj-add">
        <IconPlus className="h-3.5 w-3.5 shrink-0 text-muted" />
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && add()}
          placeholder="Add a note and press Enter"
          aria-label="New note in this project"
        />
        {title.trim() && (
          <button type="button" className="btn btn-sm" disabled={pending} onClick={add}>
            Add
          </button>
        )}
      </div>

      {notes.length === 0 ? (
        <p className="pj-empty">No notes yet.</p>
      ) : (
        <ul className="pj-list">
          {notes.map((note) => (
            <li key={note.id}>
              <span className="shrink-0 text-[14px]" aria-hidden>
                {note.icon || "📄"}
              </span>
              <Link href={`/notes/${note.id}`} className="pj-item-title">
                {note.title || "Untitled"}
              </Link>
              <span className="pj-item-meta">{note.updated_at.slice(0, 10)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
