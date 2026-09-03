"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { scheduleTask } from "@/lib/actions";
import type { TaskView } from "@/lib/types";
import { cn, dotTone, formatDuration, relativeDay, todayISO } from "@/lib/util";
import { IconSearch } from "../icons";
import { Tile } from "../ui";

/** Unscheduled work, ready to be dragged onto the grid. */
export function UnscheduledRail({ tasks }: { tasks: TaskView[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [dropping, setDropping] = useState(false);
  const [query, setQuery] = useState("");
  const today = todayISO();

  const visible = query
    ? tasks.filter((t) => t.title.toLowerCase().includes(query.toLowerCase()))
    : tasks;

  return (
    <Tile
      title="Unscheduled"
      hint={`${tasks.length} task${tasks.length === 1 ? "" : "s"} waiting for a slot`}
      className={cn("transition", dropping && "border-accent bg-accent/5")}
    >
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDropping(true);
        }}
        onDragLeave={() => setDropping(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDropping(false);
          const id = e.dataTransfer.getData("text/task-id");
          if (id) {
            startTransition(async () => {
              await scheduleTask(id, null, null);
              router.refresh();
            });
          }
        }}
        className="flex flex-col gap-2"
      >
        <label className="relative block">
          <span className="sr-only">Filter unscheduled tasks</span>
          <IconSearch className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter…"
            className="input input-sm rounded-full pl-9"
          />
        </label>
        {visible.length === 0 && (
          <p className="rounded-inner border border-dashed border-line px-3 py-5 text-center text-sm text-muted">
            Nothing unscheduled. Drop a block here to unschedule it.
          </p>
        )}
        {visible.map((task) => (
          <div
            key={task.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("text/task-id", task.id);
              e.dataTransfer.effectAllowed = "move";
            }}
            className="cursor-grab rounded-[12px] border border-line bg-surface p-3 transition hover:border-line-strong active:cursor-grabbing"
            title={task.goal_title ? `Goal: ${task.goal_title}` : "Not linked to a goal"}
          >
            <div className="flex items-center gap-2">
              <span className={cn("h-2 w-2 shrink-0 rounded-full", dotTone(task.project_color))} />
              <Link href={`/tasks/${task.id}`} className="min-w-0 flex-1 truncate text-sm font-semibold hover:text-accent">
                {task.title}
              </Link>
              {task.estimate_minutes ? (
                <span className="tag shrink-0">{formatDuration(task.estimate_minutes)}</span>
              ) : null}
            </div>
            <p className="mt-1 truncate text-xs text-muted">
              {task.goal_title ?? <span className="text-warn">No goal yet</span>}
              {task.due_date ? ` · due ${relativeDay(task.due_date, today)}` : ""}
            </p>
          </div>
        ))}
      </div>
    </Tile>
  );
}
