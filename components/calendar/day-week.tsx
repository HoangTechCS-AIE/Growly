"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { resizeTask, scheduleTask } from "@/lib/actions";
import type { Milestone, TaskView } from "@/lib/types";
import { cn, blockTone, dayName, formatClock, formatDuration, fromISODate } from "@/lib/util";
import { IconWarning } from "../icons";

const PX_PER_MIN = 0.8;
const SNAP = 15;

export function DayWeekGrid({
  dates,
  tasks,
  deadlines,
  milestones,
  dayStart,
  dayEnd,
  capacity,
  plannedByDay,
  today,
}: {
  dates: string[];
  tasks: TaskView[];
  deadlines: TaskView[];
  milestones: (Milestone & { project_title: string | null })[];
  dayStart: number;
  dayEnd: number;
  capacity: number;
  plannedByDay: Record<string, number>;
  today: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [resizing, setResizing] = useState<{ id: string; minutes: number } | null>(null);
  const columnRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const total = Math.max(60, dayEnd - dayStart);
  const height = total * PX_PER_MIN;
  const hours = Array.from(
    { length: Math.floor(total / 60) + 1 },
    (_, i) => Math.floor(dayStart / 60) + i,
  );

  function minutesFromY(date: string, clientY: number) {
    const rect = columnRefs.current[date]?.getBoundingClientRect();
    if (!rect) return dayStart;
    const raw = dayStart + (clientY - rect.top) / PX_PER_MIN;
    return Math.max(0, Math.min(24 * 60 - SNAP, Math.round(raw / SNAP) * SNAP));
  }

  function drop(date: string, event: React.DragEvent) {
    event.preventDefault();
    const id = event.dataTransfer.getData("text/task-id");
    if (!id) return;
    const minutes = minutesFromY(date, event.clientY);
    startTransition(async () => {
      await scheduleTask(id, date, minutes);
      router.refresh();
    });
  }

  function startResize(task: TaskView, event: React.PointerEvent) {
    event.preventDefault();
    event.stopPropagation();
    const startY = event.clientY;
    const base = (task.end_min ?? 0) - (task.start_min ?? 0) || 60;

    function move(e: PointerEvent) {
      const delta = (e.clientY - startY) / PX_PER_MIN;
      const minutes = Math.max(SNAP, Math.round((base + delta) / SNAP) * SNAP);
      setResizing({ id: task.id, minutes });
    }
    function up(e: PointerEvent) {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const delta = (e.clientY - startY) / PX_PER_MIN;
      const minutes = Math.max(SNAP, Math.round((base + delta) / SNAP) * SNAP);
      setResizing(null);
      if (minutes !== base) {
        startTransition(async () => {
          await resizeTask(task.id, minutes);
          router.refresh();
        });
      }
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function openDraft(date: string, event: React.MouseEvent) {
    if ((event.target as HTMLElement).closest("[data-block]")) return;
    const minutes = minutesFromY(date, event.clientY);
    router.push(`/tasks/new?date=${date}&start=${formatClock(minutes)}`);
  }

  return (
    <div className="card overflow-hidden">
      <div className="min-w-[720px] overflow-x-auto">
      <div className="flex border-b border-line bg-surface-2/40">
        <div className="w-14 shrink-0 border-r border-line" />
        {dates.map((date) => {
          const planned = plannedByDay[date] ?? 0;
          const over = planned > capacity;
          const dayDeadlines = deadlines.filter((t) => t.due_date === date);
          const dayMilestones = milestones.filter((m) => m.date === date);
          return (
            <div
              key={date}
              className={cn(
                "min-w-0 flex-1 border-r border-line px-2 py-2 last:border-r-0",
                date === today && "bg-accent/5",
              )}
            >
              <div className="flex items-baseline justify-between gap-1">
                <p className="text-[12px] font-semibold">
                  {dayName(date)}{" "}
                  <span className={cn("tabular-nums", date === today ? "text-accent" : "text-muted")}>
                    {fromISODate(date).getDate()}
                  </span>
                </p>
                <span
                  className={cn("text-[10.5px] tabular-nums", over ? "text-warn" : "text-muted")}
                  title={`${formatDuration(planned) || "0m"} planned of ${formatDuration(capacity)} capacity`}
                >
                  {over && <IconWarning className="mr-0.5 inline h-3 w-3" />}
                  {formatDuration(planned) || "—"}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {dayDeadlines.map((task) => (
                  <Link
                    key={task.id}
                    href={`/tasks/${task.id}`}
                    className="chip border-danger/30 bg-danger/10 text-danger"
                    title={`Deadline: ${task.title}`}
                  >
                    due · {task.title.slice(0, 18)}
                  </Link>
                ))}
                {dayMilestones.map((milestone) => (
                  <span
                    key={milestone.id}
                    className="chip border-warn/30 bg-warn/10 text-warn"
                    title={`Milestone: ${milestone.title}`}
                  >
                    ◆ {milestone.title.slice(0, 18)}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="max-h-[70vh] overflow-y-auto">
        <div className="flex" style={{ height }}>
          <div className="w-14 shrink-0 border-r border-line">
            {hours.map((hour) => (
              <div
                key={hour}
                className="relative border-b border-line/40 text-[10.5px] text-muted"
                style={{ height: 60 * PX_PER_MIN }}
              >
                <span className="absolute top-0.5 right-1.5 tabular-nums">
                  {`${hour}`.padStart(2, "0")}:00
                </span>
              </div>
            ))}
          </div>

          {dates.map((date) => {
            const dayTasks = tasks.filter((t) => t.scheduled_date === date && t.start_min != null);
            return (
              <div
                key={date}
                data-day-column={date}
                ref={(el) => {
                  columnRefs.current[date] = el;
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => drop(date, e)}
                onClick={(e) => openDraft(date, e)}
                title="Click an empty slot to plan something there"
                className={cn(
                  "relative min-w-0 flex-1 border-r border-line last:border-r-0",
                  date === today && "bg-accent/5",
                )}
              >
                {hours.map((hour) => (
                  <div
                    key={hour}
                    className="border-b border-line/40"
                    style={{ height: 60 * PX_PER_MIN }}
                  />
                ))}

                {date === today && <NowLine dayStart={dayStart} total={total} />}

                {dayTasks.map((task) => {
                  const start = task.start_min ?? 0;
                  const duration =
                    resizing?.id === task.id
                      ? resizing.minutes
                      : Math.max(SNAP, (task.end_min ?? start + 60) - start);
                  const top = (start - dayStart) * PX_PER_MIN;
                  return (
                    <div
                      key={task.id}
                      data-block
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/task-id", task.id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      className={cn(
                        "group absolute left-1 right-1 overflow-hidden rounded-lg border px-2 py-1 text-[11.5px] transition",
                        blockTone(task.project_color),
                        task.status === "done" && "opacity-60 line-through",
                      )}
                      style={{ top, height: Math.max(18, duration * PX_PER_MIN) }}
                      title={`${task.title}\n${formatClock(start)}–${formatClock(start + duration)}${task.goal_title ? `\nGoal: ${task.goal_title}` : ""}`}
                    >
                      <Link href={`/tasks/${task.id}`} className="block truncate font-medium">
                        {task.title}
                      </Link>
                      {duration >= 45 && (
                        <p className="truncate opacity-70">
                          {formatClock(start)}–{formatClock(start + duration)}
                          {task.goal_title ? ` · ${task.goal_title}` : ""}
                        </p>
                      )}
                      <span
                        onPointerDown={(e) => startResize(task, e)}
                        className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize opacity-0 transition group-hover:opacity-100"
                        title="Drag to change the duration"
                      >
                        <span className="mx-auto block h-0.5 w-6 rounded-full bg-current opacity-60" />
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      </div>
      <p className="border-t border-line px-3 py-2 text-[11px] text-muted">
        Drag a task from the rail onto a slot to block time, drag a block&apos;s bottom edge to
        change its duration, or click an empty slot to plan something new there.
      </p>
    </div>
  );
}

function NowLine({ dayStart, total }: { dayStart: number; total: number }) {
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (minutes < dayStart || minutes > dayStart + total) return null;
  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-10 border-t border-accent"
      style={{ top: (minutes - dayStart) * PX_PER_MIN }}
    >
      <span className="absolute -top-1 -left-1 h-2 w-2 rounded-full bg-accent" />
    </div>
  );
}
