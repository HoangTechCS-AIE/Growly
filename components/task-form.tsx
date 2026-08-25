"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createTask, updateTask, type TaskInput } from "@/lib/actions";
import { TASK_STATUSES, STATUS_LABEL, type Area, type ProjectView, type TaskStatus, type TaskView } from "@/lib/types";
import { formatClock, parseDuration } from "@/lib/util";

const RECURRENCE = [
  ["", "Does not repeat"],
  ["daily", "Every day"],
  ["weekdays", "Every weekday"],
  ["weekly", "Every week"],
  ["biweekly", "Every 2 weeks"],
  ["monthly", "Every month"],
];

export function TaskForm({
  task,
  projects,
  areas,
  defaultDate,
  defaultStart,
}: {
  task?: TaskView;
  projects: ProjectView[];
  areas: Area[];
  defaultDate?: string;
  defaultStart?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Rarely-used fields stay folded away, but never hide a value already set —
  // including the start time a calendar slot pre-fills.
  const [more, setMore] = useState(
    Boolean(
      defaultStart || task?.area_id || task?.start_min != null || task?.recurrence || task?.waiting_on,
    ),
  );
  const [form, setForm] = useState({
    title: task?.title ?? "",
    short_term_outcome: task?.short_term_outcome ?? "",
    long_term_contribution: task?.long_term_contribution ?? "",
    next_action: task?.next_action ?? "",
    notes: task?.notes ?? "",
    goal_id: task?.goal_id ?? "",
    project_id: task?.project_id ?? "",
    area_id: task?.area_id ?? "",
    status: (task?.status ?? "inbox") as TaskStatus,
    important: task?.important === 1,
    urgent: task?.urgent === 1,
    estimate: task?.estimate_minutes ? String(task.estimate_minutes) : "",
    due_date: task?.due_date ?? "",
    scheduled_date: task?.scheduled_date ?? defaultDate ?? "",
    start: task?.start_min != null ? formatClock(task.start_min) : (defaultStart ?? ""),
    waiting_on: task?.waiting_on ?? "",
    recurrence: task?.recurrence ?? "",
    tags: task?.tags.map((t) => t.name).join(", ") ?? "",
  });

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.title.trim()) return;

    const estimate = form.estimate ? parseDuration(form.estimate) : null;
    const startMin = form.start
      ? Number(form.start.split(":")[0]) * 60 + Number(form.start.split(":")[1] ?? 0)
      : null;

    const payload: TaskInput = {
      title: form.title,
      short_term_outcome: form.short_term_outcome || null,
      long_term_contribution: form.long_term_contribution || null,
      next_action: form.next_action || null,
      notes: form.notes || null,
      goal_id: form.goal_id || null,
      project_id: form.project_id || null,
      area_id: form.area_id || null,
      status: form.status,
      important: form.important,
      urgent: form.urgent,
      estimate_minutes: estimate,
      due_date: form.due_date || null,
      scheduled_date: form.scheduled_date || null,
      start_min: startMin,
      end_min: startMin != null ? Math.min(startMin + (estimate ?? 60), 1440) : null,
      waiting_on: form.waiting_on || null,
      recurrence: form.recurrence || null,
      tags: form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    };

    startTransition(async () => {
      if (task) {
        await updateTask(task.id, payload);
        router.refresh();
      } else {
        const id = await createTask(payload);
        router.push(`/tasks/${id}`);
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="card-pad">
        <label className="label" htmlFor="title">
          Task
        </label>
        <input
          id="title"
          value={form.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder="What needs to happen?"
          className="input text-[15px]"
          autoFocus={!task}
          required
        />

        <div className="mt-4">
          <label className="label" htmlFor="next">
            Next action
          </label>
          <input
            id="next"
            value={form.next_action}
            onChange={(e) => set("next_action", e.target.value)}
            placeholder="The concrete first step you could start right now"
            className="input"
          />
        </div>
      </div>

      <div className="card-pad grid grid-cols-1 gap-4 md:grid-cols-3">
        <div>
          <label className="label" htmlFor="project">
            Project
          </label>
          <select
            id="project"
            value={form.project_id}
            onChange={(e) => set("project_id", e.target.value)}
            className="input"
          >
            <option value="">No project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.title}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="status">
            Status
          </label>
          <select
            id="status"
            value={form.status}
            onChange={(e) => set("status", e.target.value as TaskStatus)}
            className="input"
          >
            {TASK_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="estimate">
            Estimate
          </label>
          <input
            id="estimate"
            value={form.estimate}
            onChange={(e) => set("estimate", e.target.value)}
            placeholder="45m · 1h30"
            className="input"
          />
        </div>

        <div>
          <label className="label" htmlFor="scheduled">
            Scheduled day
          </label>
          <input
            id="scheduled"
            type="date"
            value={form.scheduled_date}
            onChange={(e) => set("scheduled_date", e.target.value)}
            className="input"
          />
        </div>
        <div>
          <label className="label" htmlFor="due">
            Deadline
          </label>
          <input
            id="due"
            type="date"
            value={form.due_date}
            onChange={(e) => set("due_date", e.target.value)}
            className="input"
          />
        </div>
        <div>
          <label className="label" htmlFor="tags">
            Tags
          </label>
          <input
            id="tags"
            value={form.tags}
            onChange={(e) => set("tags", e.target.value)}
            placeholder="deep-work, writing"
            className="input"
          />
        </div>

        <div className="flex items-end gap-4 md:col-span-3">
          <label className="inline-flex cursor-pointer items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={form.important}
              onChange={(e) => set("important", e.target.checked)}
              className="accent-[var(--accent)]"
            />
            Important
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={form.urgent}
              onChange={(e) => set("urgent", e.target.checked)}
              className="accent-[var(--accent)]"
            />
            Urgent
          </label>

          <button
            type="button"
            className="btn btn-sm btn-ghost ml-auto"
            aria-expanded={more}
            onClick={() => setMore((open) => !open)}
          >
            {more ? "Fewer options" : "More options"}
          </button>
        </div>

        {more && (
          <>
            <div>
              <label className="label" htmlFor="start">
                Start time
              </label>
              <input
                id="start"
                type="time"
                value={form.start}
                onChange={(e) => set("start", e.target.value)}
                className="input"
              />
              <p className="mt-1 text-[11px] text-muted">
                With no estimate, a block defaults to 60 minutes.
              </p>
            </div>
            <div>
              <label className="label" htmlFor="repeat">
                Repeat
              </label>
              <select
                id="repeat"
                value={form.recurrence}
                onChange={(e) => set("recurrence", e.target.value)}
                className="input"
              >
                {RECURRENCE.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="area">
                Area
              </label>
              <select id="area" value={form.area_id} onChange={(e) => set("area_id", e.target.value)} className="input">
                <option value="">Inherit</option>
                {areas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-3">
              <label className="label" htmlFor="waiting">
                Waiting on
              </label>
              <input
                id="waiting"
                value={form.waiting_on}
                onChange={(e) => set("waiting_on", e.target.value)}
                placeholder="Person or event"
                className="input"
              />
            </div>
          </>
        )}
      </div>

      <div className="card-pad">
        <label className="label" htmlFor="notes">
          Notes
        </label>
        <textarea
          id="notes"
          value={form.notes}
          onChange={(e) => set("notes", e.target.value)}
          rows={4}
          className="input resize-y font-mono text-[12.5px]"
          placeholder="Context, links, decisions…"
        />
      </div>

      <div className="flex items-center gap-2">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {task ? "Save changes" : "Create task"}
        </button>
        <button type="button" className="btn" onClick={() => router.back()}>
          Cancel
        </button>
      </div>
    </form>
  );
}
