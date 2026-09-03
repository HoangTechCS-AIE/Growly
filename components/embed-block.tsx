"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  embedGoal, embedTasks, toggleTaskDone, type EmbeddedGoal, type EmbeddedTask,
} from "@/lib/actions";
import { parseParams, stringifyParams } from "@/lib/blocks";
import { IconCheck } from "./icons";
import { STATUS_LABEL, TASK_STATUSES, type ProjectView, type TaskStatus } from "@/lib/types";
import { chipTone, cn, formatDuration, relativeDay, todayISO } from "@/lib/util";

/** What the surrounding page contributes when a block names no filter itself. */
export interface EmbedContext {
  projectId: string | null;
  projects: ProjectView[];
}

/* ------------------------------------------------------------- task list -- */

export function TasksEmbed({
  params, context, selected, onParams,
}: {
  params: string;
  context: EmbedContext;
  selected: boolean;
  onParams: (next: string) => void;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [tasks, setTasks] = useState<EmbeddedTask[] | null>(null);
  const [error, setError] = useState(false);
  const today = todayISO();

  const config = parseParams(params);
  // No explicit filter means "whatever this page is about".
  const projectId = config.project ?? context.projectId ?? "";
  const goalId = config.goal ?? "";
  const status = config.status ?? "";
  const limit = Number(config.limit ?? 8);
  const inherited = config.project === undefined;

  const load = useCallback(() => {
    let cancelled = false;
    embedTasks({ projectId, goalId, status, limit })
      .then((rows) => {
        if (!cancelled) {
          setTasks(rows);
          setError(false);
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, goalId, status, limit]);

  useEffect(() => load(), [load]);

  const setParam = (key: string, value: string) => {
    const next = { ...config };
    if (value) next[key] = value;
    else delete next[key];
    onParams(stringifyParams(next));
  };

  const toggle = (task: EmbeddedTask) => {
    // Update in place first: the list is fetched, so a refresh alone would not
    // move the checkbox.
    setTasks(
      (current) =>
        current?.map((row) =>
          row.id === task.id
            ? { ...row, status: (row.status === "done" ? "planned" : "done") as TaskStatus }
            : row,
        ) ?? null,
    );
    startTransition(async () => {
      await toggleTaskDone(task.id);
      router.refresh();
      load();
    });
  };

  return (
    <div className={cn("nb-embed", selected && "nb-embed-selected")}>
      <div className="nb-embed-head">
        <span className="nb-embed-label">Tasks</span>
        <select
          value={config.project ?? ""}
          onChange={(event) => setParam("project", event.target.value)}
          aria-label="Filter by project"
        >
          <option value="">{context.projectId ? "This page's project" : "Any project"}</option>
          {context.projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.title}
            </option>
          ))}
        </select>
        <select
          value={config.status ?? ""}
          onChange={(event) => setParam("status", event.target.value)}
          aria-label="Filter by status"
        >
          <option value="">Any status</option>
          {TASK_STATUSES.map((value) => (
            <option key={value} value={value}>
              {STATUS_LABEL[value]}
            </option>
          ))}
        </select>
        {inherited && <span className="nb-embed-hint">follows this page</span>}
      </div>

      {error ? (
        <p className="nb-embed-empty">Could not load tasks.</p>
      ) : tasks === null ? (
        <p className="nb-embed-empty">Loading…</p>
      ) : tasks.length === 0 ? (
        <p className="nb-embed-empty">No matching tasks.</p>
      ) : (
        <ul className="nb-embed-list">
          {tasks.map((task) => {
            const done = task.status === "done";
            const overdue = !done && task.due_date != null && task.due_date < today;
            return (
              <li key={task.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={done}
                  aria-label={`Mark "${task.title}" ${done ? "not done" : "done"}`}
                  className={cn("nb-check", done && "nb-check-on")}
                  onClick={() => toggle(task)}
                >
                  {done ? <IconCheck className="h-3 w-3" strokeWidth={3} /> : null}
                </button>
                <Link href={`/tasks/${task.id}`} className={cn("nb-embed-title", done && "nb-embed-done")}>
                  {task.title}
                </Link>
                {task.project_title && !config.project && (
                  <span className={chipTone(task.project_color)}>{task.project_title}</span>
                )}
                {task.estimate_minutes ? (
                  <span className="nb-embed-meta">{formatDuration(task.estimate_minutes)}</span>
                ) : null}
                {task.due_date && (
                  <span className={cn("nb-embed-meta", overdue && "text-danger")}>
                    {relativeDay(task.due_date, today)}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* --------------------------------------------------------- goal progress -- */

export function GoalEmbed({
  params, context, selected, onParams,
}: {
  params: string;
  context: EmbedContext;
  selected: boolean;
  onParams: (next: string) => void;
}) {
  const [goal, setGoal] = useState<EmbeddedGoal | null>(null);
  const [loaded, setLoaded] = useState(false);

  const config = parseParams(params);
  const goalId = config.id ?? "";

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    embedGoal(goalId)
      .then((row) => {
        if (cancelled) return;
        setGoal(row);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [goalId]);

  const percent = goal && goal.task_total > 0 ? Math.round((goal.task_done / goal.task_total) * 100) : 0;

  return (
    <div className={cn("nb-embed", selected && "nb-embed-selected")}>
      <div className="nb-embed-head">
        <span className="nb-embed-label">Goal</span>
        <span className="nb-embed-hint">kept from an earlier version</span>
      </div>

      {!loaded ? (
        <p className="nb-embed-empty">Loading…</p>
      ) : !goal ? (
        <p className="nb-embed-empty">Pick a goal to track here.</p>
      ) : (
        <div className="nb-goal">
          <Link href={`/tasks?goal=${goal.id}`} className="nb-goal-title">
            {goal.title}
          </Link>
          <div className="nb-goal-bar" role="img" aria-label={`${percent}% of tasks done`}>
            <span style={{ width: `${percent}%` }} />
          </div>
          <p className="nb-goal-meta">
            <span>
              {goal.task_done}/{goal.task_total} tasks · {percent}%
            </span>
            {goal.minutes_logged > 0 && <span>{formatDuration(goal.minutes_logged)} logged</span>}
            {goal.target_date && <span>target {goal.target_date}</span>}
            {goal.metric && <span className="truncate">{goal.metric}</span>}
          </p>
        </div>
      )}
    </div>
  );
}
