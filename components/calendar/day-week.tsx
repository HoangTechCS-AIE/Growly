"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { resizeTask, scheduleTask } from "@/lib/actions";
import type { Milestone, TaskView } from "@/lib/types";
import { cn, blockTone, dayName, formatClock, formatDuration, fromISODate } from "@/lib/util";
import { IconDiamond, IconFlag, IconWarning } from "../icons";
import { DraggableChip } from "./chip";

const PX_PER_MIN = 1;
const SNAP = 15;

export function DayWeekGrid({
  dates,
  tasks,
  untimed,
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
  /** Assigned to a day but with no time block yet — they ride in the top row. */
  untimed: TaskView[];
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
  const single = dates.length === 1;

  const total = Math.max(60, dayEnd - dayStart);
  const hours = Array.from(
    { length: Math.ceil(total / 60) },
    (_, i) => Math.floor(dayStart / 60) + i,
  );
  const height = hours.length * 60 * PX_PER_MIN;

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const firstDate = dates[0];
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const now = new Date();
    const focus = dates.includes(today) ? now.getHours() * 60 + now.getMinutes() : 8 * 60;
    el.scrollTop = Math.max(0, (focus - dayStart) * PX_PER_MIN - el.clientHeight / 3);
    // Re-running on every render would yank the view back mid-scroll, so this
    // deliberately keys off the range rather than the `dates` array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstDate, dates.length, today, dayStart]);

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

  function dropAllDay(date: string, event: React.DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    const id = event.dataTransfer.getData("text/task-id");
    if (!id) return;
    startTransition(async () => {
      await scheduleTask(id, date, null);
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
    <div className="tile flex min-h-0 flex-1 flex-col gap-0 overflow-hidden p-0">
      <div
        ref={scrollRef}
        className="min-h-[420px] max-h-[calc(100dvh-300px)] min-w-0 flex-1 overflow-auto lg:max-h-none lg:min-h-0"
      >
        <div className={cn(!single && "min-w-[760px]")}>
          <div className="sticky top-0 z-[3] bg-surface">
          <div className="flex border-b border-line">
            <div className="w-14 shrink-0 border-r border-line" />
            {dates.map((date) => {
              const planned = plannedByDay[date] ?? 0;
              const over = planned > capacity;
              const dayDeadlines = deadlines.filter((t) => t.due_date === date);
              const dayMilestones = milestones.filter((m) => m.date === date);
              const isToday = date === today;
              return (
                <div
                  key={date}
                  data-day-header={date}
                  className="min-w-0 flex-1 border-r border-line px-2 py-2.5 last:border-r-0"
                >
                  <div className="flex items-center justify-between gap-1">
                    <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.04em] text-muted">
                      {dayName(date)}
                      <span
                        className={cn(
                          "flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 text-sm font-extrabold tabular-nums tracking-normal",
                          isToday ? "bg-accent text-accent-ink" : "text-ink",
                        )}
                      >
                        {fromISODate(date).getDate()}
                      </span>
                    </p>
                    <span
                      className={cn("text-xs font-semibold tabular-nums", over ? "text-warn" : "text-muted")}
                      title={`${formatDuration(planned) || "0m"} planned of ${formatDuration(capacity)} capacity`}
                    >
                      {over && <IconWarning className="mr-0.5 inline h-3 w-3" />}
                      {formatDuration(planned) || "—"}
                    </span>
                  </div>
                  {(dayDeadlines.length > 0 || dayMilestones.length > 0) && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {dayDeadlines.map((task) => (
                        <Link
                          key={task.id}
                          href={`/tasks/${task.id}`}
                          className="tag tag-danger max-w-full"
                          title={`Deadline: ${task.title}`}
                        >
                          <IconFlag className="h-3 w-3" />
                          <span className="truncate">{task.title}</span>
                        </Link>
                      ))}
                      {dayMilestones.map((milestone) => (
                        <span
                          key={milestone.id}
                          className="tag tag-warn max-w-full"
                          title={`Milestone: ${milestone.title}`}
                        >
                          <IconDiamond className="h-3 w-3" />
                          <span className="truncate">{milestone.title}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex border-b border-line bg-surface-2/40">
            <div className="flex w-14 shrink-0 items-center justify-end border-r border-line px-2 text-[10px] font-semibold whitespace-nowrap text-muted">
              No time
            </div>
            {dates.map((date) => {
              const items = untimed.filter((t) => t.scheduled_date === date);
              return (
                <div
                  key={date}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => dropAllDay(date, e)}
                  title="Drop a block here to keep the day but clear its time"
                  className="flex min-h-[38px] min-w-0 flex-1 flex-col gap-1 border-r border-line p-1.5 last:border-r-0"
                >
                  {items.map((task) => (
                    <DraggableChip key={task.id} task={task} />
                  ))}
                </div>
              );
            })}
          </div>

          </div>

            <div className="flex" style={{ height }}>
              <div className="w-14 shrink-0 border-r border-line">
                {hours.map((hour) => (
                  <div
                    key={hour}
                    data-hour-label={`${hour}`.padStart(2, "0")}
                    className="relative border-b border-line/60 text-[11px] font-semibold text-muted"
                    style={{ height: 60 * PX_PER_MIN }}
                  >
                    <span className="absolute top-1 right-2 tabular-nums">
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
                    className="relative min-w-0 flex-1 border-r border-line last:border-r-0"
                  >
                    {hours.map((hour) => (
                      <div
                        key={hour}
                        className="border-b border-line/60"
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
                            "group absolute left-1 right-1 z-[2] overflow-hidden rounded-[10px] border px-2.5 py-1.5 text-xs transition",
                            blockTone(task.project_color),
                            task.status === "done" && "opacity-60 line-through",
                          )}
                          style={{ top, height: Math.max(20, duration * PX_PER_MIN) }}
                          title={`${task.title}\n${formatClock(start)}–${formatClock(start + duration)}${task.goal_title ? `\nGoal: ${task.goal_title}` : ""}`}
                        >
                          <Link href={`/tasks/${task.id}`} className="block truncate font-bold">
                            {task.title}
                          </Link>
                          {duration >= 45 && (
                            <p className="truncate opacity-75">
                              {formatClock(start)}–{formatClock(start + duration)}
                              {task.goal_title ? ` · ${task.goal_title}` : ""}
                            </p>
                          )}
                          <span
                            onPointerDown={(e) => startResize(task, e)}
                            className="absolute inset-x-0 bottom-0 h-2.5 cursor-ns-resize opacity-0 transition group-hover:opacity-100"
                            title="Drag to change the duration"
                          >
                            <span className="mx-auto block h-1 w-8 rounded-full bg-current opacity-50" />
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
    </div>
  );
}

function NowLine({ dayStart, total }: { dayStart: number; total: number }) {
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (minutes < dayStart || minutes > dayStart + total) return null;
  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-[1] border-t-2 border-accent"
      style={{ top: (minutes - dayStart) * PX_PER_MIN }}
    >
      <span className="absolute -top-[5px] -left-1 h-2.5 w-2.5 rounded-full bg-accent" />
    </div>
  );
}
