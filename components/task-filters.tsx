"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { Area, ProjectView, Tag } from "@/lib/types";
import { TASK_STATUSES, STATUS_LABEL } from "@/lib/types";
import { cn } from "@/lib/util";
import { IconCheck, IconGrid, IconList, IconTarget, IconTimeline } from "./icons";

const VIEWS = [
  { key: "list", label: "List", Icon: IconList },
  { key: "board", label: "Board", Icon: IconGrid },
  { key: "matrix", label: "Matrix", Icon: IconTarget },
  { key: "timeline", label: "Timeline", Icon: IconTimeline },
];

export function TaskFilters({
  areas,
  projects,
  tags,
}: {
  areas: Area[];
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

  const hasFilter = ["status", "project", "area", "tag", "q", "bucket", "done"].some((k) =>
    params.get(k),
  );
  const showDone = params.get("done") === "1";

  const select = "input input-sm w-auto max-w-[46vw] rounded-full bg-surface font-semibold";

  return (
    <div className="mb-5 flex flex-col gap-3">
      <div className="seg self-start" role="group" aria-label="View">
        {VIEWS.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setParam("view", key)}
            aria-pressed={view === key}
            className={cn("seg-btn", view === key && "seg-on")}
          >
            <Icon className="h-4 w-4" />
            <span className={cn(view !== key && "hidden sm:inline")}>{label}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={params.get("bucket") ?? ""}
          onChange={(e) => setParam("bucket", e.target.value)}
          aria-label="Filter by date"
          className={select}
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
          className={select}
        >
          <option value="">Any status</option>
          {TASK_STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABEL[status]}
            </option>
          ))}
        </select>

        <select
          value={params.get("project") ?? ""}
          onChange={(e) => setParam("project", e.target.value)}
          aria-label="Filter by project"
          className={select}
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
          className={select}
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
            className={select}
          >
            <option value="">Any tag</option>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                #{tag.name}
              </option>
            ))}
          </select>
        )}

        <button
          type="button"
          onClick={() => setParam("done", showDone ? "" : "1")}
          aria-pressed={showDone}
          className={cn("btn btn-sm btn-outline rounded-full", showDone && "border-accent/40 bg-accent/10 text-accent")}
        >
          <IconCheck className="h-3.5 w-3.5" />
          Show done
        </button>

        {hasFilter && (
          <Link href="/tasks" className="btn btn-ghost btn-sm">
            Clear
          </Link>
        )}
      </div>
    </div>
  );
}
