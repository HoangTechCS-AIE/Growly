import Link from "next/link";
import { notFound } from "next/navigation";
import { TaskForm } from "@/components/task-form";
import {
  DependencyPanel, HistoryPanel, ReflectionPanel, SubtaskPanel, TaskAdminBar, TimePanel,
} from "@/components/task-panels";
import { Card, PageHeader } from "@/components/ui";
import {
  getTask, getTaskDeps, getTaskEvents, getTaskReflection, getTimeLogs, listAreas, listGoals,
  listNotes, listProjects, listTasks,
} from "@/lib/queries";
import { STATUS_LABEL } from "@/lib/types";
import { relativeDay, todayISO } from "@/lib/util";

export const dynamic = "force-dynamic";

export default async function TaskDetailPage({ params }: PageProps<"/tasks/[id]">) {
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

  return (
    <div className="mx-auto max-w-[1300px]">
      <PageHeader
        title={task.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span className="chip chip-plain">{STATUS_LABEL[task.status]}</span>
            {task.goal_title ? (
              <span className="chip border-accent/25 bg-accent/10 text-accent">{task.goal_title}</span>
            ) : (
              <span className="chip border-warn/30 bg-warn/10 text-warn">no goal linked</span>
            )}
            {task.project_title && <span className="chip chip-plain">{task.project_title}</span>}
            {task.scheduled_date && <span>scheduled {relativeDay(task.scheduled_date, today)}</span>}
            {task.due_date && <span>· due {relativeDay(task.due_date, today)}</span>}
          </span>
        }
        actions={
          <>
            <Link href="/tasks" className="btn">
              All tasks
            </Link>
            <TaskAdminBar task={task} />
          </>
        }
      />

      {(task.short_term_outcome || task.long_term_contribution || task.next_action) && (
        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="card-pad">
            <p className="label">Short-term outcome</p>
            <p className="text-[13px] leading-relaxed text-ink/90">
              {task.short_term_outcome || <span className="text-muted">Not defined yet.</span>}
            </p>
          </div>
          <div className="card-pad">
            <p className="label">Long-term contribution</p>
            <p className="text-[13px] leading-relaxed text-ink/90">
              {task.long_term_contribution || <span className="text-muted">Not defined yet.</span>}
            </p>
          </div>
          <div className="card-pad">
            <p className="label">Next action</p>
            <p className="text-[13px] leading-relaxed text-ink/90">
              {task.next_action || <span className="text-muted">Not defined yet.</span>}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <TaskForm task={task} goals={listGoals()} projects={listProjects()} areas={listAreas()} />

        <div className="flex flex-col gap-4">
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
            <Card title="Linked notes">
              <ul className="flex flex-col gap-1 text-[13px]">
                {notes.map((note) => (
                  <li key={note.id}>
                    <Link href={`/notes/${note.id}`} className="hover:text-accent">
                      {note.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <HistoryPanel events={events} />
        </div>
      </div>
    </div>
  );
}
