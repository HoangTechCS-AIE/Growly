"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { scheduleTask } from "@/lib/actions";
import type { Milestone, TaskView } from "@/lib/types";
import { cn, dotTone, formatDuration, fromISODate } from "@/lib/util";
import { IconDiamond, IconFlag } from "../icons";

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
    <div className="tile flex min-h-0 flex-1 flex-col gap-0 overflow-hidden p-0">
      <div className="min-h-0 flex-1 overflow-auto">
      <div className="flex h-full min-h-[560px] min-w-[720px] flex-col">
        <div className="grid shrink-0 grid-cols-7 border-b border-line">
          {headers.map((day) => (
            <div key={day} className="px-3 py-2 text-xs font-bold uppercase tracking-[0.04em] text-muted">
              {day}
            </div>
          ))}
        </div>
        <div
          className="grid min-h-0 flex-1 grid-cols-7"
          style={{ gridTemplateRows: `repeat(${Math.ceil(cells.length / 7)}, minmax(116px, 1fr))` }}
        >
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
                  "min-h-[116px] overflow-hidden border-r border-b border-line p-2 transition [&:nth-child(7n)]:border-r-0",
                  !inMonth && "bg-surface-2/60",
                  over === date && "bg-accent/5 ring-2 ring-accent/40 ring-inset",
                )}
              >
                <div className="mb-1.5 flex items-center justify-between">
                  <Link
                    href={`/calendar?view=day&date=${date}`}
                    className={cn(
                      "flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 text-sm font-bold tabular-nums transition hover:bg-surface-3",
                      date === today
                        ? "bg-accent text-accent-ink hover:bg-accent"
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
                        "text-[11px] font-semibold tabular-nums",
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
                      className="flex items-center gap-1 truncate px-1 text-[11px] font-semibold text-warn"
                      title={`Milestone: ${milestone.title}`}
                    >
                      <IconDiamond className="h-3 w-3 shrink-0" />
                      <span className="truncate">{milestone.title}</span>
                    </span>
                  ))}
                  {dayDeadlines.slice(0, 2).map((task) => (
                    <Link
                      key={`due-${task.id}`}
                      href={`/tasks/${task.id}`}
                      className="flex items-center gap-1 truncate px-1 text-[11px] font-semibold text-danger hover:underline"
                      title={`Deadline: ${task.title}`}
                    >
                      <IconFlag className="h-3 w-3 shrink-0" />
                      <span className="truncate">{task.title}</span>
                    </Link>
                  ))}
                  {dayTasks.slice(0, 3).map((task) => (
                    <Link
                      key={task.id}
                      href={`/tasks/${task.id}`}
                      className={cn(
                        "flex items-center gap-1.5 truncate rounded-md px-1 py-0.5 text-xs font-medium transition hover:bg-surface-3",
                        task.status === "done" && "text-muted line-through",
                      )}
                      title={task.goal_title ? `${task.title} · ${task.goal_title}` : task.title}
                    >
                      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dotTone(task.project_color))} />
                      <span className="truncate">{task.title}</span>
                    </Link>
                  ))}
                  {dayTasks.length > 3 && (
                    <Link
                      href={`/calendar?view=day&date=${date}`}
                      className="px-1 text-[11px] font-semibold text-muted hover:text-accent"
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
    </div>
  );
}
