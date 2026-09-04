import Link from "next/link";
import type { Milestone, ProjectView, TaskView } from "@/lib/types";
import { cn, addDaysISO, dotTone, formatDate, startOfWeekISO, todayISO } from "@/lib/util";
import { Meter } from "./ui";

/** A 13-week look-ahead: project spans, milestones and dated tasks on one axis. */
export function Timeline({
  projects,
  tasks,
  milestones,
  weekStartsOn = 1,
}: {
  projects: ProjectView[];
  tasks: TaskView[];
  milestones: (Milestone & { project_title: string | null })[];
  weekStartsOn?: number;
}) {
  const today = todayISO();
  const windowStart = startOfWeekISO(addDaysISO(today, -7), weekStartsOn);
  const windowEnd = addDaysISO(windowStart, 13 * 7 - 1);
  const span = 13 * 7;

  const offset = (iso: string) => {
    const days =
      (new Date(`${iso}T00:00:00`).getTime() - new Date(`${windowStart}T00:00:00`).getTime()) /
      86400000;
    return Math.max(0, Math.min(100, (days / span) * 100));
  };

  const weeks = Array.from({ length: 13 }, (_, i) => addDaysISO(windowStart, i * 7));

  if (!projects.length) {
    return (
      <p className="tile text-center text-sm text-muted">
        No projects yet. Create one in Projects to see it on the timeline.
      </p>
    );
  }

  return (
    <div className="tile gap-0 overflow-x-auto p-0">
      <div className="min-w-[900px]">
        <div className="flex border-b border-line bg-surface-2/60 px-5 py-2.5">
          <div className="w-64 shrink-0 tile-title">Project</div>
          <div className="relative flex-1">
            <div className="flex">
              {weeks.map((week) => (
                <div key={week} className="flex-1 text-[11px] font-semibold text-muted">
                  {formatDate(week).slice(4)}
                </div>
              ))}
            </div>
          </div>
        </div>

        {projects.map((project) => {
          const projectTasks = tasks.filter((t) => t.project_id === project.id);
          const dated = projectTasks.filter((t) => t.due_date ?? t.scheduled_date);
          const projectMilestones = milestones.filter((m) => m.project_id === project.id && m.date);
          const start = project.start_date ?? project.created_at.slice(0, 10);
          const end = project.due_date ?? windowEnd;
          const left = offset(start);
          const right = offset(end);

          return (
            <div key={project.id} className="flex items-center border-b border-line px-5 py-3 last:border-b-0">
              <div className="w-64 shrink-0 pr-4">
                <Link href={`/projects/${project.id}`} className="flex items-center gap-2 text-sm font-semibold hover:text-accent">
                  <span className={cn("h-2 w-2 shrink-0 rounded-full", dotTone(project.color))} />
                  <span className="truncate">{project.title}</span>
                </Link>
                <p className="mt-0.5 truncate text-xs text-muted">
                  {project.task_done}/{project.task_total} tasks
                </p>
                <Meter
                  value={project.task_done}
                  max={Math.max(project.task_total, 1)}
                  className="mt-1.5 w-32"
                />
              </div>

              <div className="relative h-10 flex-1">
                <div className="absolute inset-0 flex">
                  {weeks.map((week) => (
                    <div key={week} className="flex-1 border-l border-line/60" />
                  ))}
                </div>
                <div
                  className="absolute top-0 bottom-0 w-px bg-accent"
                  style={{ left: `${offset(today)}%` }}
                  title={`Today · ${today}`}
                />
                <div
                  className={cn("absolute top-3.5 h-3 rounded-full opacity-70", dotTone(project.color))}
                  style={{ left: `${left}%`, width: `${Math.max(1.5, right - left)}%` }}
                  title={`${project.title}: ${project.start_date ?? "—"} → ${project.due_date ?? "—"}`}
                />
                {dated.map((task) => (
                  <span
                    key={task.id}
                    className="absolute top-[11px] h-2 w-2 -translate-x-1/2 rounded-full bg-ink"
                    style={{ left: `${offset((task.due_date ?? task.scheduled_date)!)}%` }}
                    title={`${task.title} · ${task.due_date ? `due ${task.due_date}` : task.scheduled_date}`}
                  />
                ))}
                {projectMilestones.map((milestone) => (
                  <span
                    key={milestone.id}
                    className={cn(
                      "absolute top-[22px] h-2.5 w-2.5 -translate-x-1/2 rotate-45 rounded-[2px] border-2",
                      milestone.done ? "border-accent bg-accent" : "border-warn bg-warn/30",
                    )}
                    style={{ left: `${offset(milestone.date!)}%` }}
                    title={`Milestone: ${milestone.title} · ${milestone.date}`}
                  />
                ))}
              </div>
            </div>
          );
        })}

        <p className="px-5 py-2.5 text-xs text-muted">
          Bars are project spans · dots are dated tasks · diamonds are milestones · the vertical line is today.
        </p>
      </div>
    </div>
  );
}
