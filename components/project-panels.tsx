"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createNote, createProject, createTask, toggleTaskDone, updateProject,
} from "@/lib/actions";
import type { NoteView, ProjectStatus, ProjectView, TaskView } from "@/lib/types";
import { chipTone, cn, formatDuration, pct, relativeDay } from "@/lib/util";
import { IconCheck, IconNote, IconPlus, IconTask } from "./icons";
import { Meter, Tile } from "./ui";

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
        <IconPlus className="h-4 w-4" />
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
        className="input w-64 rounded-full"
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
    <Link href={`/projects/${project.id}`} className="tile gap-3 transition hover:border-line-strong">
      <div className="flex items-center gap-2.5">
        <span className={cn("h-3 w-3 shrink-0 rounded-full tone-dot", `tone-${project.color}`)} aria-hidden />
        <h3 className="min-w-0 flex-1 truncate text-lg font-bold tracking-tight">{project.title}</h3>
        <span className={chipTone(project.color)}>{STATUS_LABEL[project.status]}</span>
      </div>
      {project.description && (
        <p className="line-clamp-2 text-sm leading-relaxed text-muted">{project.description}</p>
      )}
      <div className="flex items-baseline justify-between text-xs font-semibold text-muted">
        <span>{share}% done</span>
        <span className="tabular-nums">
          {project.task_done} / {project.task_total}
        </span>
      </div>
      <Meter value={project.task_done} max={Math.max(project.task_total, 1)} />
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1">
          <IconTask className="h-3.5 w-3.5" />
          {project.task_total} task{project.task_total === 1 ? "" : "s"}
        </span>
        <span className="inline-flex items-center gap-1">
          <IconNote className="h-3.5 w-3.5" />
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
    <div className="tile gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className={cn("h-4 w-4 shrink-0 rounded-full tone-dot", `tone-${project.color}`)} aria-hidden />
        <input
          value={form.title}
          onChange={(event) => {
            setForm((f) => ({ ...f, title: event.target.value }));
            setDirty(true);
          }}
          onBlur={save}
          className="min-w-0 flex-1 border-0 bg-transparent p-0 text-2xl font-extrabold tracking-tight text-ink outline-none placeholder:text-muted/50 lg:text-3xl"
          aria-label="Project name"
          placeholder="Untitled project"
        />
        <div className="flex items-center gap-2">
          <select
            value={project.status}
            onChange={(event) => patch({ status: event.target.value as ProjectStatus })}
            aria-label="Project status"
            className="input input-sm w-auto rounded-full font-semibold"
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
            className="input input-sm w-auto rounded-full font-semibold capitalize"
          >
            {COLORS.map((color) => (
              <option key={color} value={color}>
                {color}
              </option>
            ))}
          </select>
        </div>
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
        className="w-full resize-y rounded-ctl border border-transparent bg-transparent px-2 py-1.5 text-base leading-relaxed text-ink outline-none transition placeholder:text-muted/70 hover:bg-surface-2 focus:border-line focus:bg-surface-2"
      />

      <div className="flex flex-wrap items-center gap-4 border-t border-line pt-4 text-sm text-muted">
        <label className="flex items-center gap-2">
          <span className="font-semibold">Start</span>
          <input
            type="date"
            defaultValue={project.start_date ?? ""}
            onChange={(event) => patch({ start_date: event.target.value || null })}
            className="input input-sm w-auto"
          />
        </label>
        <label className="flex items-center gap-2">
          <span className="font-semibold">Due</span>
          <input
            type="date"
            defaultValue={project.due_date ?? ""}
            onChange={(event) => patch({ due_date: event.target.value || null })}
            className="input input-sm w-auto"
          />
        </label>
        {project.goal_title && (
          <span className="tag tag-accent">{project.goal_title}</span>
        )}
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

function AddRow({
  placeholder,
  label,
  value,
  onChange,
  onSubmit,
  pending,
}: {
  placeholder: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  pending: boolean;
}) {
  return (
    <div className="relative">
      <IconPlus className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => event.key === "Enter" && onSubmit()}
        placeholder={placeholder}
        aria-label={label}
        className="input rounded-full pr-20 pl-10"
      />
      {value.trim() && (
        <button
          type="button"
          className="btn btn-sm btn-primary absolute top-1/2 right-1.5 -translate-y-1/2"
          disabled={pending}
          onClick={onSubmit}
        >
          Add
        </button>
      )}
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
    <Tile
      title="Tasks"
      action={
        <span className="tag tabular-nums">
          {done.length} / {tasks.length} done
        </span>
      }
    >
      <AddRow
        placeholder="Add a small task and press Enter"
        label="New task in this project"
        value={title}
        onChange={setTitle}
        onSubmit={add}
        pending={pending}
      />

      {tasks.length === 0 ? (
        <p className="py-3 text-sm text-muted">No tasks yet. Add the first small step above.</p>
      ) : (
        <ul className="flex flex-col">
          {[...open, ...done].map((task) => (
            <li key={task.id} className="list-row">
              <button
                type="button"
                role="checkbox"
                aria-checked={task.status === "done"}
                aria-label={`Mark "${task.title}" ${task.status === "done" ? "not done" : "done"}`}
                className={cn("check", task.status === "done" && "check-on")}
                onClick={() =>
                  startTransition(async () => {
                    await toggleTaskDone(task.id);
                    router.refresh();
                  })
                }
              >
                <IconCheck className="h-3.5 w-3.5" strokeWidth={3} />
              </button>
              <Link
                href={`/tasks/${task.id}`}
                className={cn(
                  "min-w-0 flex-1 truncate text-base font-semibold hover:text-accent",
                  task.status === "done" && "font-medium text-muted line-through",
                )}
              >
                {task.title}
              </Link>
              {task.estimate_minutes ? (
                <span className="tag">{formatDuration(task.estimate_minutes)}</span>
              ) : null}
              {task.scheduled_date && (
                <span className="tag">{relativeDay(task.scheduled_date, today)}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Tile>
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
    <Tile title="Notes" action={<span className="tag tabular-nums">{notes.length}</span>}>
      <AddRow
        placeholder="Add a note and press Enter"
        label="New note in this project"
        value={title}
        onChange={setTitle}
        onSubmit={add}
        pending={pending}
      />

      {notes.length === 0 ? (
        <p className="py-3 text-sm text-muted">No notes yet.</p>
      ) : (
        <ul className="flex flex-col">
          {notes.map((note) => (
            <li key={note.id} className="list-row">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center text-base text-muted" aria-hidden>
                {note.icon || <IconNote className="h-4 w-4" />}
              </span>
              <Link href={`/notes/${note.id}`} className="min-w-0 flex-1 truncate text-base font-semibold hover:text-accent">
                {note.title || "Untitled"}
              </Link>
              <span className="text-xs text-muted">{note.updated_at.slice(0, 10)}</span>
            </li>
          ))}
        </ul>
      )}
    </Tile>
  );
}
