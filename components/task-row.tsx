"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { postponeTask, toggleFocus, toggleTaskDone } from "@/lib/actions";
import type { TaskView } from "@/lib/types";
import { cn, dotTone, formatDuration, relativeDay } from "@/lib/util";
import { IconClock, IconLink, IconReview, IconStar, IconTarget } from "./icons";

export function TaskRow({
  task,
  today,
  showFocus = false,
  showSchedule = true,
  draggable = false,
  className,
}: {
  task: TaskView;
  today: string;
  showFocus?: boolean;
  showSchedule?: boolean;
  draggable?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const done = task.status === "done";
  const overdue = !done && task.due_date != null && task.due_date < today;

  function act(fn: () => Promise<void>) {
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  }

  return (
    <div
      data-task-id={task.id}
      data-status={task.status}
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/task-id", task.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      className={cn(
        "group flex items-start gap-2.5 rounded-lg border border-transparent px-2 py-2 transition",
        "hover:border-line hover:bg-surface-2",
        pending && "opacity-50",
        draggable && "cursor-grab active:cursor-grabbing",
        className,
      )}
    >
      <button
        type="button"
        data-role="toggle-done"
        aria-label={done ? "Mark as not done" : "Mark as done"}
        onClick={() => act(() => toggleTaskDone(task.id))}
        className={cn(
          "mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[6px] border transition",
          "before:absolute before:-m-2.5 before:h-10 before:w-10 before:content-[''] relative",
          done
            ? "border-accent bg-accent text-accent-ink"
            : "border-line-strong text-transparent hover:border-accent hover:text-accent/60",
        )}
      >
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5l4.5 4.5L19 7" />
        </svg>
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
          <Link
            href={`/tasks/${task.id}`}
            className={cn(
              "min-w-0 flex-1 basis-[55%] text-[13.5px] leading-5 transition hover:text-accent",
              done && "text-muted line-through",
            )}
          >
            {task.important === 1 && <span className="mr-1 text-warn">★</span>}
            {task.urgent === 1 && <span className="mr-1 text-danger">!</span>}
            {task.title}
          </Link>

          <div className="ml-auto flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
            {task.blocked_by > 0 && (
              <span className="chip border-danger/30 bg-danger/10 text-danger" title="Waiting on another task">
                blocked
              </span>
            )}
            {task.status === "waiting" && task.waiting_on && (
              <span className="chip chip-plain" title="Waiting on">
                waiting: {task.waiting_on}
              </span>
            )}
            {task.recurrence && <IconReview className="h-3.5 w-3.5" />}
            {task.estimate_minutes ? (
              <span className="inline-flex items-center gap-1">
                <IconClock className="h-3.5 w-3.5" />
                {formatDuration(task.estimate_minutes)}
              </span>
            ) : null}
            {task.due_date && (
              <span className={cn("chip", overdue ? "border-danger/30 bg-danger/10 text-danger" : "chip-plain")}>
                due {relativeDay(task.due_date, today)}
              </span>
            )}
            {showSchedule && task.scheduled_date && task.scheduled_date !== today && (
              <span className="chip chip-plain">{relativeDay(task.scheduled_date, today)}</span>
            )}
          </div>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
          {task.project_title && (
            <span className="inline-flex items-center gap-1">
              <span className={cn("h-1.5 w-1.5 rounded-full", dotTone(task.project_color))} />
              {task.project_title}
            </span>
          )}
          {task.goal_title ? (
            <span className="inline-flex items-center gap-1 text-muted" title="Long-term goal this serves">
              <IconTarget className="h-3 w-3" />
              {task.goal_title}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-warn/70" title="Not linked to any goal">
              <IconLink className="h-3 w-3" />
              no goal
            </span>
          )}
          {task.area_name && <span className="chip chip-plain">{task.area_name}</span>}
          {task.tags.map((tag) => (
            <span key={tag.id} className="chip chip-plain">
              #{tag.name}
            </span>
          ))}
          {task.subtask_total > 0 && (
            <span>
              {task.subtask_done}/{task.subtask_total} subtasks
            </span>
          )}
          {task.postponed_count >= 2 && (
            <span className="text-warn/80" title="Rescheduled several times">
              postponed ×{task.postponed_count}
            </span>
          )}
        </div>
      </div>

      <div className="row-actions flex shrink-0 items-center gap-0.5">
        {showFocus && (
          <button
            type="button"
            title={task.is_focus === 1 ? "Remove from today's focus" : "Make it one of today's Big 3"}
            onClick={() => act(() => toggleFocus(today, task.id))}
            className={cn("btn btn-ghost btn-sm", task.is_focus === 1 && "text-warn opacity-100")}
          >
            <IconStar className="h-3.5 w-3.5" />
          </button>
        )}
        {!done && (
          <button
            type="button"
            title="Push to tomorrow"
            onClick={() => act(() => postponeTask(task.id, 1))}
            className="btn btn-ghost btn-sm"
          >
            →
          </button>
        )}
      </div>
    </div>
  );
}
