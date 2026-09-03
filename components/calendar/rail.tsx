"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { scheduleTask } from "@/lib/actions";
import type { TaskView } from "@/lib/types";
import { cn, dotTone, formatDuration, relativeDay, todayISO } from "@/lib/util";
import { IconSearch } from "../icons";

/** Work with no day at all, waiting to be dragged onto the grid.
    A horizontal strip rather than a column: the grid is the point of this page,
    and this only earns its space when there is something in it, so the caller
    renders it only when `tasks` is non-empty. */
export function UnscheduledStrip({ tasks }: { tasks: TaskView[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [dropping, setDropping] = useState(false);
  const [query, setQuery] = useState("");
  const today = todayISO();

  const visible = query
    ? tasks.filter((t) => t.title.toLowerCase().includes(query.toLowerCase()))
    : tasks;

  return (
    <section
      onDragOver={(e) => {
        e.preventDefault();
        setDropping(true);
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDropping(false);
        const id = e.dataTransfer.getData("text/task-id");
        if (!id) return;
        startTransition(async () => {
          await scheduleTask(id, null, null);
          router.refresh();
        });
      }}
      className={cn(
        "tile flex-row flex-wrap items-center gap-x-4 gap-y-2 py-3 transition",
        dropping && "border-accent bg-accent/5",
      )}
    >
      <div className="flex shrink-0 items-center gap-2">
        <h2 className="tile-title">Unscheduled</h2>
        <span className="tag tabular-nums">{tasks.length}</span>
      </div>

      {tasks.length > 6 && (
        <label className="relative block w-44 shrink-0">
          <span className="sr-only">Filter unscheduled tasks</span>
          <IconSearch className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter…"
            className="input input-sm rounded-full pl-9"
          />
        </label>
      )}

      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
        {visible.map((task) => (
          <div
            key={task.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("text/task-id", task.id);
              e.dataTransfer.effectAllowed = "move";
            }}
            className="flex h-9 shrink-0 cursor-grab items-center gap-2 rounded-full border border-line bg-surface px-3 transition hover:border-line-strong active:cursor-grabbing"
            title={[
              task.goal_title ? `Goal: ${task.goal_title}` : "Not linked to a goal",
              task.due_date ? `Due ${relativeDay(task.due_date, today)}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          >
            <span className={cn("h-2 w-2 shrink-0 rounded-full", dotTone(task.project_color))} />
            <Link
              href={`/tasks/${task.id}`}
              className="max-w-[220px] truncate text-sm font-semibold hover:text-accent"
            >
              {task.title}
            </Link>
            {task.estimate_minutes ? (
              <span className="text-xs tabular-nums text-muted">
                {formatDuration(task.estimate_minutes)}
              </span>
            ) : null}
          </div>
        ))}
        {visible.length === 0 && (
          <p className="text-sm text-muted">No task matches that filter.</p>
        )}
      </div>

      <p className="shrink-0 text-xs text-muted">Drag one onto the grid, or drop a block here to unschedule it.</p>
    </section>
  );
}
