import Link from "next/link";
import { notFound } from "next/navigation";
import { IconChevronLeft } from "@/components/icons";
import { TaskForm } from "@/components/task-form";
import {
  DependencyPanel, HistoryPanel, ReflectionPanel, SubtaskPanel, TaskAdminBar, TimePanel,
} from "@/components/task-panels";
import { Ladder, Tile } from "@/components/ui";
import {
  getTask, getTaskDeps, getTaskEvents, getTaskReflection, getTimeLogs, listAreas,
  listNotes, listProjects, listTasks,
} from "@/lib/queries";
import { STATUS_LABEL } from "@/lib/types";
import { cn, formatClock, relativeDay, todayISO } from "@/lib/util";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function TaskDetailPage({ params }: PageProps<"/tasks/[id]">) {
  await requireUser();
  const { id } = await params;
  const today = todayISO();
  const task = getTask(id, today);
  if (!task) notFound();

  const subtasks = listTasks({ parentId: id, includeDone: true }, today);
  const deps = getTaskDeps(id);
  const candidates = listTasks({ limit: 200 }, today);
  const logs = getTimeLogs(id);
  const reflection = getTaskReflection(id);
  const events = getTaskEvents(id);
  const notes = listNotes({ taskId: id });
  const overdue = task.status !== "done" && task.due_date != null && task.due_date < today;

  return (
    <div className="mx-auto max-w-[1300px]">
      <nav className="mb-4 flex items-center gap-1 text-sm font-semibold text-muted" aria-label="Breadcrumb">
        <Link href="/tasks" className="inline-flex items-center gap-1 rounded-full py-1 pr-2 transition hover:text-ink">
          <IconChevronLeft className="h-4 w-4" />
          Tasks
        </Link>
      </nav>

      <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className={cn("tag", task.status === "done" ? "tag-accent" : "")}>{STATUS_LABEL[task.status]}</span>
            {task.scheduled_date && (
              <span className="tag">
                {relativeDay(task.scheduled_date, today)}
                {task.start_min != null ? ` · ${formatClock(task.start_min)}` : ""}
              </span>
            )}
            {task.due_date && (
              <span className={cn("tag", overdue && "tag-danger")}>due {relativeDay(task.due_date, today)}</span>
            )}
            {task.tags.map((tag) => (
              <span key={tag.id} className="tag">
                #{tag.name}
              </span>
            ))}
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink lg:text-3xl">{task.title}</h1>
          <Ladder
            project={task.project_title}
            projectColor={task.project_color}
            goal={task.goal_title}
            area={task.area_name}
            className="mt-2 text-sm"
          />
        </div>
        <TaskAdminBar task={task} />
      </div>

      {task.next_action && (
        <Tile small className="mb-4 gap-1">
          <p className="tile-title">Next action</p>
          <p className="text-base font-semibold leading-relaxed">{task.next_action}</p>
        </Tile>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-7 xl:col-span-8">
          <TaskForm task={task} projects={listProjects()} areas={listAreas()} />
        </div>

        <div className="flex flex-col gap-4 lg:col-span-5 xl:col-span-4">
          <SubtaskPanel parentId={id} subtasks={subtasks} />
          <TimePanel taskId={id} logs={logs} estimate={task.estimate_minutes} />
          <ReflectionPanel taskId={id} reflection={reflection} isDone={task.status === "done"} />
          <DependencyPanel
            taskId={id}
            blockedBy={deps.blockedBy}
            blocking={deps.blocking}
            candidates={candidates}
          />
          {notes.length > 0 && (
            <Tile title="Linked notes">
              <ul className="flex flex-col">
                {notes.map((note) => (
                  <li key={note.id} className="list-row">
                    <Link href={`/notes/${note.id}`} className="min-w-0 flex-1 truncate text-sm font-semibold hover:text-accent">
                      {note.icon ? `${note.icon} ` : ""}
                      {note.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </Tile>
          )}
          <HistoryPanel events={events} />
        </div>
      </div>
    </div>
  );
}
