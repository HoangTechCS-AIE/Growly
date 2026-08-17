"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { Area, GoalView, ProjectView, Tag } from "@/lib/types";
import { TASK_STATUSES, STATUS_LABEL } from "@/lib/types";
import { cn } from "@/lib/util";
import { IconGrid, IconList, IconTarget, IconTimeline } from "./icons";

const VIEWS = [
  { key: "list", label: "List", Icon: IconList },
  { key: "board", label: "Board", Icon: IconGrid },
  { key: "matrix", label: "Matrix", Icon: IconTarget },
  { key: "timeline", label: "Timeline", Icon: IconTimeline },
];

export function TaskFilters({
  areas,
  goals,
  projects,
  tags,
}: {
  areas: Area[];
  goals: GoalView[];
  projects: ProjectView[];
  tags: Tag[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const view = params.get("view") ?? "list";

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`/tasks?${next.toString()}`);
  }

  const hasFilter = ["status", "goal", "project", "area", "tag", "q", "bucket", "done"].some((k) =>
    params.get(k),
  );

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="flex rounded-lg border border-line bg-surface p-0.5">
        {VIEWS.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setParam("view", key)}
            aria-pressed={view === key}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[7px] px-2.5 py-1.5 text-[12.5px] font-medium transition cursor-pointer",
              view === key ? "bg-surface-3 text-ink" : "text-muted hover:text-ink",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      <select
        value={params.get("bucket") ?? ""}
        onChange={(e) => setParam("bucket", e.target.value)}
        aria-label="Filter by date"
        className="input w-auto max-w-[45vw] py-1.5"
      >
        <option value="">All dates</option>
        <option value="today">Today</option>
        <option value="week">This week</option>
        <option value="overdue">Overdue</option>
        <option value="unscheduled">Unscheduled</option>
      </select>

      <select
        value={params.get("status") ?? ""}
        onChange={(e) => setParam("status", e.target.value)}
        aria-label="Filter by status"
        className="input w-auto max-w-[45vw] py-1.5"
      >
        <option value="">Any status</option>
        {TASK_STATUSES.map((status) => (
          <option key={status} value={status}>
            {STATUS_LABEL[status]}
          </option>
        ))}
      </select>

      <select
        value={params.get("goal") ?? ""}
        onChange={(e) => setParam("goal", e.target.value)}
        aria-label="Filter by goal"
        className="input w-auto max-w-[45vw] py-1.5"
      >
        <option value="">Any goal</option>
        {goals.map((goal) => (
          <option key={goal.id} value={goal.id}>
            {goal.title}
          </option>
        ))}
      </select>

      <select
        value={params.get("project") ?? ""}
        onChange={(e) => setParam("project", e.target.value)}
        aria-label="Filter by project"
        className="input w-auto max-w-[45vw] py-1.5"
      >
        <option value="">Any project</option>
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.title}
          </option>
        ))}
      </select>

      <select
        value={params.get("area") ?? ""}
        onChange={(e) => setParam("area", e.target.value)}
        aria-label="Filter by area"
        className="input w-auto max-w-[45vw] py-1.5"
      >
        <option value="">Any area</option>
        {areas.map((area) => (
          <option key={area.id} value={area.id}>
            {area.name}
          </option>
        ))}
      </select>

      {tags.length > 0 && (
        <select
          value={params.get("tag") ?? ""}
          onChange={(e) => setParam("tag", e.target.value)}
          aria-label="Filter by tag"
          className="input w-auto max-w-[45vw] py-1.5"
        >
          <option value="">Any tag</option>
          {tags.map((tag) => (
            <option key={tag.id} value={tag.id}>
              #{tag.name}
            </option>
          ))}
        </select>
      )}

      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[12.5px] text-muted">
        <input
          type="checkbox"
          checked={params.get("done") === "1"}
          onChange={(e) => setParam("done", e.target.checked ? "1" : "")}
          className="accent-[var(--accent)]"
        />
        Show done
      </label>

      {hasFilter && (
        <Link href="/tasks" className="btn btn-ghost btn-sm">
          Clear
        </Link>
      )}
    </div>
  );
}
