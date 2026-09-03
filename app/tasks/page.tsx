import Link from "next/link";
import { Board } from "@/components/board";
import { IconPlus } from "@/components/icons";
import { Matrix } from "@/components/matrix";
import { TaskFilters } from "@/components/task-filters";
import { TaskList } from "@/components/task-list";
import { Timeline } from "@/components/timeline";
import { EmptyState, PageHeader, Tile } from "@/components/ui";
import {
  getSettings, listAreas, listMilestones, listProjects, listTags, listTasks,
  type TaskFilter,
} from "@/lib/queries";
import type { TaskStatus, TaskView } from "@/lib/types";
import { addDaysISO, startOfWeekISO, todayISO } from "@/lib/util";

export const dynamic = "force-dynamic";

function groupByDate(tasks: TaskView[], today: string) {
  const weekEnd = addDaysISO(today, 7);
  const groups: { key: string; label: string; tasks: TaskView[] }[] = [
    { key: "overdue", label: "Overdue", tasks: [] },
    { key: "today", label: "Today", tasks: [] },
    { key: "tomorrow", label: "Tomorrow", tasks: [] },
    { key: "week", label: "Next 7 days", tasks: [] },
    { key: "later", label: "Later", tasks: [] },
    { key: "someday", label: "No date", tasks: [] },
    { key: "done", label: "Done", tasks: [] },
  ];
  const at = (key: string) => groups.find((g) => g.key === key)!;

  for (const task of tasks) {
    const date = task.scheduled_date ?? task.due_date;
    if (task.status === "done") at("done").tasks.push(task);
    else if (!date) at("someday").tasks.push(task);
    else if (date < today) at("overdue").tasks.push(task);
    else if (date === today) at("today").tasks.push(task);
    else if (date === addDaysISO(today, 1)) at("tomorrow").tasks.push(task);
    else if (date <= weekEnd) at("week").tasks.push(task);
    else at("later").tasks.push(task);
  }
  return groups.filter((g) => g.tasks.length);
}

export default async function TasksPage({ searchParams }: PageProps<"/tasks">) {
  const params = await searchParams;
  const single = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const today = todayISO();
  const settings = getSettings();
  const view = single("view") ?? "list";
  const bucket = single("bucket");

  const filter: TaskFilter = {
    status: single("status") ? [single("status") as TaskStatus] : undefined,
    projectId: single("project"),
    areaId: single("area"),
    tagId: single("tag"),
    search: single("q"),
    parentId: null,
    includeDone: single("done") === "1" || view === "board",
  };

  if (bucket === "today") filter.scheduledOn = today;
  if (bucket === "week") {
    filter.scheduledFrom = startOfWeekISO(today, settings.week_starts_on);
    filter.scheduledTo = addDaysISO(startOfWeekISO(today, settings.week_starts_on), 6);
  }
  if (bucket === "overdue") filter.dueBefore = today;
  if (bucket === "unscheduled") filter.unscheduled = true;

  const tasks = listTasks(filter, today);
  const areas = listAreas();
  const projects = listProjects();
  const tags = listTags();

  const openCount = tasks.filter((t) => t.status !== "done").length;
  const looseTasks = tasks.filter((t) => t.status !== "done" && !t.project_id).length;

  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader
        title="Tasks"
        subtitle={`${openCount} open${looseTasks ? ` · ${looseTasks} not in a project` : " · all in a project"}`}
        actions={
          <Link href="/tasks/new" className="btn btn-primary">
            <IconPlus className="h-4 w-4" />
            New task
          </Link>
        }
      />

      <TaskFilters areas={areas} projects={projects} tags={tags} />

      {view === "board" && <Board tasks={tasks} today={today} />}

      {view === "matrix" && <Matrix tasks={tasks.filter((t) => t.status !== "done")} today={today} />}

      {view === "timeline" && (
        <Timeline
          projects={projects}
          tasks={tasks}
          milestones={listMilestones()}
          weekStartsOn={settings.week_starts_on}
        />
      )}

      {view === "list" && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {groupByDate(tasks, today).map((group) => (
            <Tile
              key={group.key}
              title={group.label}
              action={<span className="tag tabular-nums">{group.tasks.length}</span>}
              className={cn(group.key === "today" || group.key === "overdue" ? "xl:col-span-2" : "")}
            >
              <TaskList tasks={group.tasks} today={today} showFocus />
            </Tile>
          ))}
          {!tasks.length && (
            <Tile className="xl:col-span-2">
              <EmptyState
                title="No tasks match these filters"
                hint="Capture one with the quick-add bar above, or clear the filters."
                action={
                  <Link href="/tasks" className="btn btn-sm">
                    Clear filters
                  </Link>
                }
              />
            </Tile>
          )}
        </div>
      )}
    </div>
  );
}

function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}
