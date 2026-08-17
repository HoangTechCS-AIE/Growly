import Link from "next/link";
import { Board } from "@/components/board";
import { Matrix } from "@/components/matrix";
import { TaskFilters } from "@/components/task-filters";
import { TaskList } from "@/components/task-list";
import { Timeline } from "@/components/timeline";
import { Card, PageHeader } from "@/components/ui";
import {
  getSettings, listAreas, listGoals, listMilestones, listProjects, listTags, listTasks,
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
    goalId: single("goal"),
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
  const goals = listGoals();
  const projects = listProjects();
  const tags = listTags();

  const openCount = tasks.filter((t) => t.status !== "done").length;
  const unaligned = tasks.filter((t) => t.status !== "done" && !t.effective_goal_id).length;

  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader
        title="Tasks"
        subtitle={`${openCount} open${unaligned ? ` · ${unaligned} not linked to a goal` : " · all linked to a goal"}`}
        actions={
          <Link href="/tasks/new" className="btn btn-primary">
            New task
          </Link>
        }
      />

      <TaskFilters areas={areas} goals={goals} projects={projects} tags={tags} />

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
        <div className="flex flex-col gap-4">
          {groupByDate(tasks, today).map((group) => (
            <Card key={group.key} title={group.label} hint={`${group.tasks.length} task(s)`}>
              <TaskList tasks={group.tasks} today={today} showFocus />
            </Card>
          ))}
          {!tasks.length && (
            <Card>
              <p className="px-2 py-10 text-center text-[13px] text-muted">
                No tasks match these filters. Capture one with the quick-add bar above.
              </p>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
