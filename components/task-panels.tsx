"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  addDependency, addSubtask, archiveTask, deleteTask, logTime, removeDependency,
  saveReflection, setTaskStatus, toggleTaskDone,
} from "@/lib/actions";
import type { Reflection, Task, TaskEvent, TaskView, TimeLog } from "@/lib/types";
import { cn, formatDuration, parseDuration } from "@/lib/util";
import { Card, Meter } from "./ui";
import { IconTrash } from "./icons";

export function SubtaskPanel({ parentId, subtasks }: { parentId: string; subtasks: TaskView[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [pending, startTransition] = useTransition();
  const done = subtasks.filter((s) => s.status === "done").length;

  function act(fn: () => Promise<void>) {
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  }

  return (
    <Card title="Checklist" hint={subtasks.length ? `${done}/${subtasks.length} done` : "Break it down"}>
      {subtasks.length > 0 && (
        <>
          <Meter value={done} max={subtasks.length} className="mb-3" />
          <ul className="mb-2 flex flex-col">
            {subtasks.map((sub) => (
              <li key={sub.id} className="group flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-surface-2">
                <button
                  type="button"
                  onClick={() => act(() => toggleTaskDone(sub.id))}
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition",
                    sub.status === "done"
                      ? "border-accent bg-accent text-accent-ink"
                      : "border-line-strong text-transparent hover:border-accent",
                  )}
                >
                  <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="3.5">
                    <path d="M5 12.5l4.5 4.5L19 7" />
                  </svg>
                </button>
                <Link
                  href={`/tasks/${sub.id}`}
                  className={cn("flex-1 truncate text-[13px]", sub.status === "done" && "text-muted line-through")}
                >
                  {sub.title}
                </Link>
                <button
                  type="button"
                  onClick={() => act(() => deleteTask(sub.id))}
                  className="row-actions btn btn-ghost btn-sm"
                  title="Delete subtask"
                >
                  <IconTrash className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && title.trim()) {
            const value = title;
            setTitle("");
            act(() => addSubtask(parentId, value));
          }
        }}
        placeholder="+ Add a step"
        className="input"
        disabled={pending}
      />
    </Card>
  );
}

export function DependencyPanel({
  taskId,
  blockedBy,
  blocking,
  candidates,
}: {
  taskId: string;
  blockedBy: Task[];
  blocking: Task[];
  candidates: TaskView[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  function act(fn: () => Promise<void>) {
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  }

  return (
    <Card title="Dependencies" hint="What has to happen first">
      {blockedBy.length > 0 && (
        <div className="mb-3">
          <p className="section-title mb-1">Waits for</p>
          <ul className="flex flex-col gap-1">
            {blockedBy.map((dep) => (
              <li key={dep.id} className="flex items-center gap-2 text-[13px]">
                <span
                  className={cn(
                    "chip",
                    dep.status === "done"
                      ? "border-accent/30 bg-accent/10 text-accent"
                      : "border-danger/30 bg-danger/10 text-danger",
                  )}
                >
                  {dep.status === "done" ? "done" : "open"}
                </span>
                <Link href={`/tasks/${dep.id}`} className="flex-1 truncate hover:text-accent">
                  {dep.title}
                </Link>
                <button
                  type="button"
                  onClick={() => act(() => removeDependency(taskId, dep.id))}
                  className="btn btn-ghost btn-sm"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {blocking.length > 0 && (
        <div className="mb-3">
          <p className="section-title mb-1">Blocks</p>
          <ul className="flex flex-col gap-1">
            {blocking.map((dep) => (
              <li key={dep.id} className="truncate text-[13px]">
                <Link href={`/tasks/${dep.id}`} className="hover:text-accent">
                  {dep.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <select
        className="input"
        value=""
        onChange={(e) => {
          if (e.target.value) act(() => addDependency(taskId, e.target.value));
        }}
      >
        <option value="">+ This task waits for…</option>
        {candidates
          .filter((c) => c.id !== taskId && !blockedBy.some((b) => b.id === c.id))
          .slice(0, 100)
          .map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
      </select>
    </Card>
  );
}

export function TimePanel({
  taskId,
  logs,
  estimate,
}: {
  taskId: string;
  logs: TimeLog[];
  estimate: number | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [, startTransition] = useTransition();
  const total = logs.reduce((sum, log) => sum + log.minutes, 0);

  function add() {
    const minutes = parseDuration(value);
    if (!minutes) return;
    setValue("");
    startTransition(async () => {
      await logTime(taskId, minutes);
      router.refresh();
    });
  }

  return (
    <Card
      title="Time"
      hint={
        estimate
          ? `${formatDuration(total) || "0m"} spent of ${formatDuration(estimate)} planned`
          : `${formatDuration(total) || "0m"} spent`
      }
    >
      {estimate ? (
        <Meter
          value={total}
          max={estimate}
          tone={total > estimate ? "warn" : "accent"}
          className="mb-3"
        />
      ) : null}
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Log time — 45m, 1h30"
          className="input"
        />
        <button type="button" onClick={add} className="btn">
          Log
        </button>
      </div>
      {logs.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1 text-[12px] text-muted">
          {logs.slice(0, 6).map((log) => (
            <li key={log.id} className="flex justify-between">
              <span>{log.date}</span>
              <span className="tabular-nums">{formatDuration(log.minutes)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** The three questions asked when a task is finished. */
export function ReflectionPanel({
  taskId,
  reflection,
  isDone,
}: {
  taskId: string;
  reflection?: Reflection;
  isDone: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    met_expectation: reflection?.met_expectation ?? "",
    contributed: reflection?.contributed ?? "",
    next_step: reflection?.next_step ?? "",
  });
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  if (!isDone && !reflection) {
    return (
      <Card title="Closing the loop" hint="Available once the task is done">
        <p className="px-1 py-3 text-[12.5px] text-muted">
          When you finish this task, Growly asks three questions: did the result match the
          expectation, did it move its project forward, and what is the next step.
        </p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() =>
            startTransition(async () => {
              await setTaskStatus(taskId, "done");
              router.refresh();
            })
          }
        >
          Mark as done
        </button>
      </Card>
    );
  }

  return (
    <Card title="Closing the loop" hint="What did finishing this actually produce?">
      <div className="flex flex-col gap-3">
        <div>
          <label className="label">Did the result match what you expected?</label>
          <textarea
            value={form.met_expectation}
            onChange={(e) => setForm({ ...form, met_expectation: e.target.value })}
            rows={2}
            className="input resize-y"
          />
        </div>
        <div>
          <label className="label">Did it move the project forward?</label>
          <textarea
            value={form.contributed}
            onChange={(e) => setForm({ ...form, contributed: e.target.value })}
            rows={2}
            className="input resize-y"
          />
        </div>
        <div>
          <label className="label">What is the next step?</label>
          <input
            value={form.next_step}
            onChange={(e) => setForm({ ...form, next_step: e.target.value })}
            className="input"
            placeholder="Becomes this task's next action"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn btn-primary"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await saveReflection(taskId, form);
                setSaved(true);
                router.refresh();
              })
            }
          >
            Save reflection
          </button>
          {saved && <span className="text-[12px] text-accent">Saved</span>}
        </div>
      </div>
    </Card>
  );
}

export function TaskAdminBar({ task }: { task: TaskView }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  function act(fn: () => Promise<void>, back = false) {
    startTransition(async () => {
      await fn();
      if (back) router.push("/tasks");
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className="btn"
        onClick={() => act(() => archiveTask(task.id, task.archived === 0))}
      >
        {task.archived === 1 ? "Unarchive" : "Archive"}
      </button>
      <button
        type="button"
        className="btn text-danger"
        onClick={() => {
          if (confirm("Delete this task permanently? Archiving keeps the history.")) {
            act(() => deleteTask(task.id), true);
          }
        }}
      >
        Delete
      </button>
    </div>
  );
}

export function HistoryPanel({ events }: { events: TaskEvent[] }) {
  if (!events.length) return null;
  return (
    <Card title="History" hint={`${events.length} event(s)`}>
      <ul className="flex flex-col gap-1.5 text-[12px]">
        {events.map((event) => (
          <li key={event.id} className="flex gap-2">
            <span className="w-28 shrink-0 tabular-nums text-muted">
              {event.created_at.slice(0, 16).replace("T", " ")}
            </span>
            <span className="text-muted">{event.kind}</span>
            <span className="min-w-0 flex-1 truncate">{event.detail ?? ""}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
