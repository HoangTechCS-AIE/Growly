"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { scheduleTask } from "@/lib/actions";
import type { Milestone, TaskView } from "@/lib/types";
import { cn, dotTone, formatDuration, fromISODate } from "@/lib/util";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function MonthGrid({
  cells,
  anchor,
  tasks,
  deadlines,
  milestones,
  plannedByDay,
  capacity,
  today,
  weekStartsOn = 1,
}: {
  cells: string[];
  anchor: string;
  tasks: TaskView[];
  deadlines: TaskView[];
  milestones: (Milestone & { project_title: string | null })[];
  plannedByDay: Record<string, number>;
  capacity: number;
  today: string;
  weekStartsOn?: number;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [over, setOver] = useState<string | null>(null);
  const month = anchor.slice(0, 7);
  const headers = weekStartsOn === 1 ? WEEKDAYS : [WEEKDAYS[6], ...WEEKDAYS.slice(0, 6)];

  function drop(date: string, event: React.DragEvent) {
    event.preventDefault();
    setOver(null);
    const id = event.dataTransfer.getData("text/task-id");
    if (!id) return;
    startTransition(async () => {
      await scheduleTask(id, date, null);
      router.refresh();
    });
  }

  return (
    <div className="card overflow-x-auto">
      <div className="min-w-[720px]">
      <div className="grid grid-cols-7 border-b border-line bg-surface-2/40">
        {headers.map((day) => (
          <div key={day} className="px-2 py-1.5 text-[11px] font-semibold text-muted">
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((date) => {
          const inMonth = date.slice(0, 7) === month;
          const dayTasks = tasks.filter((t) => t.scheduled_date === date);
          const dayDeadlines = deadlines.filter((t) => t.due_date === date);
          const dayMilestones = milestones.filter((m) => m.date === date);
          const planned = plannedByDay[date] ?? 0;

          return (
            <div
              key={date}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(date);
              }}
              onDragLeave={() => setOver((d) => (d === date ? null : d))}
              onDrop={(e) => drop(date, e)}
              className={cn(
                "min-h-[112px] border-r border-b border-line p-1.5 transition [&:nth-child(7n)]:border-r-0",
                !inMonth && "bg-canvas/60",
                over === date && "bg-surface-2 ring-1 ring-accent/40 ring-inset",
              )}
            >
              <div className="mb-1 flex items-baseline justify-between">
                <Link
                  href={`/calendar?view=day&date=${date}`}
                  className={cn(
                    "text-[11.5px] tabular-nums transition hover:text-accent",
                    date === today
                      ? "flex h-5 w-5 items-center justify-center rounded-full bg-accent font-semibold text-accent-ink"
                      : inMonth
                        ? "text-ink"
                        : "text-muted/60",
                  )}
                >
                  {fromISODate(date).getDate()}
                </Link>
                {planned > 0 && (
                  <span
                    className={cn(
                      "text-[10px] tabular-nums",
                      planned > capacity ? "text-warn" : "text-muted",
                    )}
                  >
                    {formatDuration(planned)}
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-0.5">
                {dayMilestones.map((milestone) => (
                  <span
                    key={milestone.id}
                    className="truncate text-[10.5px] text-warn"
                    title={`Milestone: ${milestone.title}`}
                  >
                    ◆ {milestone.title}
                  </span>
                ))}
                {dayDeadlines.slice(0, 2).map((task) => (
                  <Link
                    key={`due-${task.id}`}
                    href={`/tasks/${task.id}`}
                    className="truncate text-[10.5px] text-danger hover:underline"
                    title={`Deadline: ${task.title}`}
                  >
                    ⚑ {task.title}
                  </Link>
                ))}
                {dayTasks.slice(0, 3).map((task) => (
                  <Link
                    key={task.id}
                    href={`/tasks/${task.id}`}
                    className={cn(
                      "flex items-center gap-1 truncate rounded px-1 py-0.5 text-[10.5px] transition hover:bg-surface-3",
                      task.status === "done" && "text-muted line-through",
                    )}
                    title={task.goal_title ? `${task.title} · ${task.goal_title}` : task.title}
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 shrink-0 rounded-full",
                        dotTone(task.project_color),
                      )}
                    />
                    <span className="truncate">{task.title}</span>
                  </Link>
                ))}
                {dayTasks.length > 3 && (
                  <Link
                    href={`/calendar?view=day&date=${date}`}
                    className="px-1 text-[10.5px] text-muted hover:text-accent"
                  >
                    +{dayTasks.length - 3} more
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
      </div>
    </div>
  );
}
