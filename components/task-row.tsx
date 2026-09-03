"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { postponeTask, toggleFocus, toggleTaskDone } from "@/lib/actions";
import type { TaskView } from "@/lib/types";
import { cn, formatDuration, relativeDay } from "@/lib/util";
import {
  IconAlert, IconArrowRight, IconCheck, IconClock, IconRepeat, IconStar, IconStarFilled,
} from "./icons";
import { Ladder } from "./ui";

/** One task: a checkbox, a title, and one line that says what it serves.
    Tags are kept to the ones that change what you do next (blocked, waiting,
    due); everything else lives on the task page. */
export function TaskRow({
  task,
  today,
  showFocus = false,
  showSchedule = true,
  draggable = false,
  compact = false,
  className,
}: {
  task: TaskView;
  today: string;
  showFocus?: boolean;
  showSchedule?: boolean;
  draggable?: boolean;
  /** Card form for boards and quadrants: own border, tags inline. */
  compact?: boolean;
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

  const tags = (
    <>
      {task.blocked_by > 0 && (
        <span className="tag tag-danger" title="Waiting on another task">
          blocked
        </span>
      )}
      {task.status === "waiting" && task.waiting_on && (
        <span className="tag" title="Waiting on">
          waiting · {task.waiting_on}
        </span>
      )}
      {task.due_date && (
        <span className={cn("tag", overdue && "tag-danger")}>
          due {relativeDay(task.due_date, today)}
        </span>
      )}
      {showSchedule && task.scheduled_date && task.scheduled_date !== today && (
        <span className="tag">{relativeDay(task.scheduled_date, today)}</span>
      )}
    </>
  );
  const hasTags =
    task.blocked_by > 0 ||
    (task.status === "waiting" && !!task.waiting_on) ||
    !!task.due_date ||
    (showSchedule && !!task.scheduled_date && task.scheduled_date !== today);

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
        "group flex items-start gap-3 transition",
        compact
          ? "rounded-[12px] border border-line bg-surface p-3"
          : "border-t border-line py-3 first:border-t-0 first:pt-0 last:pb-0",
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
        className={cn("check mt-px", done && "check-on")}
      >
        <IconCheck className="h-3.5 w-3.5" strokeWidth={3} />
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <Link
            href={`/tasks/${task.id}`}
            className={cn(
              "min-w-0 flex-1 text-base font-semibold leading-snug transition hover:text-accent",
              done && "font-medium text-muted line-through",
            )}
          >
            {task.important === 1 && (
              <IconStarFilled className="mr-1 -mt-0.5 inline h-3.5 w-3.5 text-warn" />
            )}
            {task.urgent === 1 && (
              <IconAlert className="mr-1 -mt-0.5 inline h-3.5 w-3.5 text-danger" strokeWidth={2.2} />
            )}
            {task.title}
          </Link>
          {!compact && hasTags && (
            <div className="ml-auto hidden shrink-0 items-center gap-1.5 sm:flex">{tags}</div>
          )}
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted">
          <Ladder
            project={task.project_title}
            projectColor={task.project_color}
            goal={task.goal_title}
            area={task.area_name}
          />
          {task.estimate_minutes ? (
            <span className="inline-flex items-center gap-1">
              <IconClock className="h-3 w-3" />
              {formatDuration(task.estimate_minutes)}
            </span>
          ) : null}
          {task.subtask_total > 0 && (
            <span className="tabular-nums">
              {task.subtask_done}/{task.subtask_total} steps
            </span>
          )}
          {task.recurrence && <IconRepeat className="h-3 w-3" aria-label="Repeats" />}
          {task.postponed_count >= 2 && (
            <span className="text-warn" title="Rescheduled several times">
              postponed ×{task.postponed_count}
            </span>
          )}
          {hasTags && (
            <span className={cn("flex flex-wrap items-center gap-1.5", !compact && "sm:hidden")}>{tags}</span>
          )}
        </div>
      </div>

      <div className="row-actions flex shrink-0 items-center gap-0.5">
        {showFocus && (
          <button
            type="button"
            title={task.is_focus === 1 ? "Remove from today's Big 3" : "Make it one of today's Big 3"}
            aria-label={task.is_focus === 1 ? "Remove from today's Big 3" : "Make it one of today's Big 3"}
            aria-pressed={task.is_focus === 1}
            onClick={() => act(() => toggleFocus(today, task.id))}
            className={cn("btn btn-ghost btn-icon btn-sm", task.is_focus === 1 && "text-warn opacity-100")}
          >
            {task.is_focus === 1 ? <IconStarFilled className="h-4 w-4" /> : <IconStar className="h-4 w-4" />}
          </button>
        )}
        {!done && (
          <button
            type="button"
            title="Push to tomorrow"
            aria-label="Push to tomorrow"
            onClick={() => act(() => postponeTask(task.id, 1))}
            className="btn btn-ghost btn-icon btn-sm"
          >
            <IconArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
