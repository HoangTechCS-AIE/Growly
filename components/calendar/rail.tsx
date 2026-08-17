"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { scheduleTask } from "@/lib/actions";
import type { TaskView } from "@/lib/types";
import { cn, dotTone, formatDuration } from "@/lib/util";
import { Card } from "../ui";

/** Unscheduled work, ready to be dragged onto the grid. */
export function UnscheduledRail({ tasks }: { tasks: TaskView[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [dropping, setDropping] = useState(false);
  const [query, setQuery] = useState("");

  const visible = query
    ? tasks.filter((t) => t.title.toLowerCase().includes(query.toLowerCase()))
    : tasks;

  return (
    <Card
      title="Unscheduled"
      hint={`${tasks.length} task(s) waiting for a slot`}
      className={cn("transition", dropping && "border-accent/60")}
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
        className="flex flex-col gap-1"
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter…"
          className="input mb-1"
        />
        {visible.length === 0 && (
          <p className="px-1 py-4 text-center text-[12px] text-muted">
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
            className="cursor-grab rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-[12.5px] transition hover:border-line-strong active:cursor-grabbing"
            title={task.goal_title ? `Goal: ${task.goal_title}` : "Not linked to a goal"}
          >
            <div className="flex items-center gap-1.5">
              <span
                className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dotTone(task.project_color))}
              />
              <Link href={`/tasks/${task.id}`} className="min-w-0 flex-1 truncate hover:text-accent">
                {task.title}
              </Link>
              {task.estimate_minutes ? (
                <span className="shrink-0 text-[10.5px] text-muted">
                  {formatDuration(task.estimate_minutes)}
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 truncate text-[10.5px] text-muted">
              {task.goal_title ?? "no goal"}
              {task.due_date ? ` · due ${task.due_date}` : ""}
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
}
