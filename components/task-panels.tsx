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
import { Meter, Tile } from "./ui";
import { IconCheck, IconTrash, IconX } from "./icons";

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
    <Tile
      title="Steps"
      hint={subtasks.length ? `${done} of ${subtasks.length} done` : "Break it down"}
      action={subtasks.length ? <span className="tag tabular-nums">{done}/{subtasks.length}</span> : null}
    >
      {subtasks.length > 0 && (
        <>
          <Meter value={done} max={subtasks.length} />
          <ul className="flex flex-col">
            {subtasks.map((sub) => (
              <li key={sub.id} className="group list-row">
                <button
                  type="button"
                  aria-label={sub.status === "done" ? "Mark step as not done" : "Mark step as done"}
                  onClick={() => act(() => toggleTaskDone(sub.id))}
                  className={cn("check", sub.status === "done" && "check-on")}
                >
                  <IconCheck className="h-3.5 w-3.5" strokeWidth={3} />
                </button>
                <Link
                  href={`/tasks/${sub.id}`}
                  className={cn(
                    "min-w-0 flex-1 truncate text-base font-medium hover:text-accent",
                    sub.status === "done" && "text-muted line-through",
                  )}
                >
                  {sub.title}
                </Link>
                <button
                  type="button"
                  onClick={() => act(() => deleteTask(sub.id))}
                  className="row-actions btn btn-ghost btn-icon btn-sm"
                  title="Delete step"
                  aria-label="Delete step"
                >
                  <IconTrash className="h-4 w-4" />
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
        placeholder="+ Add a step and press Enter"
        aria-label="New step"
        className="input input-sm rounded-full"
        disabled={pending}
      />
    </Tile>
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
    <Tile title="Dependencies" hint="What has to happen first">
      {blockedBy.length > 0 && (
        <div>
          <p className="label">Waits for</p>
          <ul className="flex flex-col">
            {blockedBy.map((dep) => (
              <li key={dep.id} className="list-row">
                <span className={cn("tag", dep.status === "done" ? "tag-accent" : "tag-danger")}>
                  {dep.status === "done" ? "done" : "open"}
                </span>
                <Link href={`/tasks/${dep.id}`} className="min-w-0 flex-1 truncate text-sm font-semibold hover:text-accent">
                  {dep.title}
                </Link>
                <button
                  type="button"
                  onClick={() => act(() => removeDependency(taskId, dep.id))}
                  className="btn btn-ghost btn-icon btn-sm"
                  aria-label="Remove dependency"
                >
                  <IconX className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {blocking.length > 0 && (
        <div>
          <p className="label">Blocks</p>
          <ul className="flex flex-col">
            {blocking.map((dep) => (
              <li key={dep.id} className="list-row">
                <Link href={`/tasks/${dep.id}`} className="min-w-0 flex-1 truncate text-sm font-semibold hover:text-accent">
                  {dep.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <select
        className="input input-sm"
        value=""
        aria-label="Add a task this one waits for"
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
    </Tile>
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
    <Tile
      title="Time"
      hint={
        estimate
          ? `${formatDuration(total) || "0m"} spent of ${formatDuration(estimate)} planned`
          : `${formatDuration(total) || "0m"} spent`
      }
    >
      {estimate ? (
        <Meter value={total} max={estimate} tone={total > estimate ? "warn" : "accent"} />
      ) : null}
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Log time — 45m, 1h30"
          aria-label="Log time"
          className="input input-sm rounded-full"
        />
        <button type="button" onClick={add} className="btn btn-sm btn-primary">
          Log
        </button>
      </div>
      {logs.length > 0 && (
        <ul className="flex flex-col gap-1 text-xs text-muted">
          {logs.slice(0, 6).map((log) => (
            <li key={log.id} className="flex justify-between">
              <span>{log.date}</span>
              <span className="font-semibold tabular-nums text-ink">{formatDuration(log.minutes)}</span>
            </li>
          ))}
        </ul>
      )}
    </Tile>
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
      <Tile title="Closing the loop" hint="Available once the task is done">
        <p className="text-sm leading-relaxed text-muted">
          When you finish this task, Growly asks three questions: did the result match the
          expectation, did it move its project forward, and what is the next step.
        </p>
        <button
          type="button"
          className="btn btn-accent self-start"
          onClick={() =>
            startTransition(async () => {
              await setTaskStatus(taskId, "done");
              router.refresh();
            })
          }
        >
          <IconCheck className="h-4 w-4" strokeWidth={2.4} />
          Mark as done
        </button>
      </Tile>
    );
  }

  return (
    <Tile title="Closing the loop" hint="What did finishing this actually produce?">
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
          {saved && <span className="text-xs font-semibold text-accent">Saved</span>}
        </div>
      </div>
    </Tile>
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
        className="btn btn-outline"
        onClick={() => act(() => archiveTask(task.id, task.archived === 0))}
      >
        {task.archived === 1 ? "Unarchive" : "Archive"}
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-danger"
        onClick={() => {
          if (confirm("Delete this task permanently? Archiving keeps the history.")) {
            act(() => deleteTask(task.id), true);
          }
        }}
      >
        <IconTrash className="h-4 w-4" />
        Delete
      </button>
    </div>
  );
}

export function HistoryPanel({ events }: { events: TaskEvent[] }) {
  if (!events.length) return null;
  return (
    <Tile title="History" action={<span className="tag tabular-nums">{events.length}</span>}>
      <ul className="flex flex-col gap-1.5 text-xs">
        {events.map((event) => (
          <li key={event.id} className="flex gap-2">
            <span className="w-28 shrink-0 tabular-nums text-muted">
              {event.created_at.slice(0, 16).replace("T", " ")}
            </span>
            <span className="font-semibold text-muted">{event.kind}</span>
            <span className="min-w-0 flex-1 truncate">{event.detail ?? ""}</span>
          </li>
        ))}
      </ul>
    </Tile>
  );
}
