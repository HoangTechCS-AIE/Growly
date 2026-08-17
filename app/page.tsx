import Link from "next/link";
import { Card, EmptyState, Meter, MiniBars, PageHeader, StatTile } from "@/components/ui";
import { TaskList } from "@/components/task-list";
import { TaskRow } from "@/components/task-row";
import { IconWarning } from "@/components/icons";
import {
  alignmentScore, capacityForDay, getSettings, listGoals, listNotes, listTasks,
  loggedMinutesByDay, stuckItems, timePerGoal, weekStats,
} from "@/lib/queries";
import {
  addDaysISO, formatClock, formatDateLong, formatDuration, pct, relativeDay,
  startOfWeekISO, todayISO, weekDates,
} from "@/lib/util";

export const dynamic = "force-dynamic";

export default function TodayPage() {
  const today = todayISO();
  const settings = getSettings();
  const weekStart = startOfWeekISO(today, settings.week_starts_on);
  const weekEnd = addDaysISO(weekStart, 6);

  const focus = listTasks({ focusDate: today, includeDone: true }, today);
  const scheduled = listTasks({ scheduledOn: today, parentId: null }, today);
  const timeBlocks = scheduled.filter((t) => t.start_min != null);
  const overdue = listTasks({ dueBefore: today, parentId: null }, today);
  const inbox = listTasks({ status: ["inbox"], parentId: null }, today);
  const capacity = capacityForDay(today);
  const alignment = alignmentScore(weekStart, weekEnd);
  const week = weekStats(weekStart, weekEnd);
  const goals = listGoals({ status: "active" });
  const invested = timePerGoal(weekStart, weekEnd);
  const stuck = stuckItems(today);
  const notes = listNotes({ limit: 5 });

  const loggedByDay = new Map<string, number>(weekDates(weekStart).map((day) => [day, 0]));
  for (const row of loggedMinutesByDay(weekStart, weekEnd)) loggedByDay.set(row.date, row.minutes);

  const focusCandidates = [...scheduled, ...overdue, ...inbox]
    .filter((t) => t.is_focus === 0 && t.status !== "done")
    .filter((task, index, list) => list.findIndex((t) => t.id === task.id) === index)
    .slice(0, 8);

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Today"
        subtitle={`${formatDateLong(today)} · ${scheduled.filter((t) => t.status !== "done").length} scheduled · ${inbox.length} in inbox`}
        actions={
          <>
            <Link href="/review?kind=daily" className="btn">
              Daily review
            </Link>
            <Link href="/calendar" className="btn">
              Open calendar
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <div className="flex flex-col gap-4">
          <Card
            title="Today's Big 3"
            hint="The 1–3 things that make today a win. Star a task to promote it."
          >
            {focus.length > 0 ? (
              <TaskList tasks={focus} today={today} showFocus showSchedule={false} />
            ) : (
              <EmptyState
                title="No focus picked yet"
                hint="Morning planning: choose up to three tasks below. Everything else is secondary."
              />
            )}

            {focus.length < 3 && focusCandidates.length > 0 && (
              <div className="mt-3 border-t border-line pt-3">
                <p className="section-title mb-1.5 px-2">Candidates</p>
                <div className="flex flex-col divide-y divide-line/60">
                  {focusCandidates.map((task) => (
                    <TaskRow key={task.id} task={task} today={today} showFocus />
                  ))}
                </div>
              </div>
            )}
          </Card>

          <Card
            title="Schedule"
            hint={
              capacity.over
                ? `Planned ${formatDuration(capacity.planned)} against ${formatDuration(capacity.capacity)} of capacity`
                : `${formatDuration(capacity.planned) || "0m"} planned · ${formatDuration(capacity.capacity)} capacity`
            }
            action={
              capacity.over ? (
                <span className="chip border-warn/30 bg-warn/10 text-warn">
                  <IconWarning className="h-3.5 w-3.5" /> over capacity
                </span>
              ) : null
            }
          >
            <Meter
              value={capacity.planned}
              max={capacity.capacity}
              tone={capacity.over ? "warn" : "accent"}
              className="mb-3"
            />
            {timeBlocks.length ? (
              <ul className="flex flex-col gap-1">
                {timeBlocks.map((task) => (
                  <li key={task.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-surface-2">
                    <span className="w-24 shrink-0 font-mono text-[11.5px] tabular-nums text-muted">
                      {formatClock(task.start_min)}–{formatClock(task.end_min)}
                    </span>
                    <Link
                      href={`/tasks/${task.id}`}
                      className="min-w-0 flex-1 truncate text-[13px] hover:text-accent"
                    >
                      {task.title}
                    </Link>
                    <span className="shrink-0 text-[11px] text-muted">{task.goal_title ?? "—"}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                title="Nothing time-blocked"
                hint="Drag tasks onto the calendar to reserve time for them."
              />
            )}
          </Card>

          <Card title="Scheduled today" hint={`${scheduled.length} task(s)`}>
            <TaskList
              tasks={scheduled}
              today={today}
              showFocus
              showSchedule={false}
              empty="Nothing scheduled for today yet."
            />
          </Card>

          {overdue.length > 0 && (
            <Card title="Overdue" hint="Past their deadline — reschedule or drop them">
              <TaskList tasks={overdue} today={today} showFocus />
            </Card>
          )}

          {inbox.length > 0 && (
            <Card
              title="Inbox"
              hint="Unsorted captures — give each one a goal, a project, or a day"
              action={
                <Link href="/tasks?view=list&status=inbox" className="btn btn-sm">
                  Triage
                </Link>
              }
            >
              <TaskList tasks={inbox.slice(0, 6)} today={today} showFocus />
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <StatTile
              label="Alignment"
              value={`${alignment.score}%`}
              tone={alignment.score >= 70 ? "good" : alignment.score >= 40 ? "warn" : "bad"}
              sub={`${alignment.aligned}/${alignment.total} of this week's work ladders up to a goal`}
            />
            <StatTile
              label="Done this week"
              value={week.completed}
              sub={`${formatDuration(week.loggedMinutes) || "0m"} logged`}
            />
          </div>

          <Card title="This week" hint={`${weekStart} → ${weekEnd}`}>
            <MiniBars
              data={weekDates(weekStart).map((date) => ({
                label: date.slice(8),
                value: loggedByDay.get(date) ?? 0,
                emphasis: date === today,
                title: `${relativeDay(date, today)}: ${formatDuration(loggedByDay.get(date) ?? 0) || "0m"} logged`,
              }))}
            />
            <p className="mt-2 text-[11px] text-muted">Time logged per day (minutes).</p>
          </Card>

          <Card
            title="Active goals"
            action={
              <Link href="/strategy" className="btn btn-sm btn-ghost">
                Strategy
              </Link>
            }
          >
            {goals.length ? (
              <ul className="flex flex-col gap-3">
                {goals.map((goal) => {
                  const share = pct(goal.task_done, goal.task_total);
                  const minutes = invested.find((i) => i.goal_id === goal.id)?.minutes ?? 0;
                  return (
                    <li key={goal.id}>
                      <div className="mb-1 flex items-baseline justify-between gap-2">
                        <Link href={`/strategy?goal=${goal.id}`} className="truncate text-[13px] hover:text-accent">
                          {goal.title}
                        </Link>
                        <span className="shrink-0 text-[11px] tabular-nums text-muted">
                          {goal.task_done}/{goal.task_total}
                        </span>
                      </div>
                      <Meter value={goal.task_done} max={Math.max(goal.task_total, 1)} />
                      <p className="mt-1 text-[11px] text-muted">
                        {share}% of tasks done
                        {goal.target_date ? ` · target ${relativeDay(goal.target_date, today)}` : ""}
                        {minutes ? ` · ${formatDuration(minutes)} this week` : ""}
                      </p>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState
                title="No active goals"
                hint="Add a goal in Strategy, then link projects and tasks to it."
                action={
                  <Link href="/strategy" className="btn btn-sm btn-primary">
                    Set up strategy
                  </Link>
                }
              />
            )}
          </Card>

          {(stuck.postponed.length > 0 || stuck.staleProjects.length > 0 || stuck.idleGoals.length > 0) && (
            <Card title="Needs attention" hint="Slipping, stalled, or drifting">
              <ul className="flex flex-col gap-2 text-[12.5px]">
                {stuck.postponed.slice(0, 4).map((task) => (
                  <li key={task.id} className="flex items-start gap-2">
                    <span className="chip border-warn/30 bg-warn/10 text-warn">×{task.postponed_count}</span>
                    <Link href={`/tasks/${task.id}`} className="min-w-0 flex-1 truncate hover:text-accent">
                      {task.title}
                    </Link>
                  </li>
                ))}
                {stuck.staleProjects.slice(0, 3).map((project) => (
                  <li key={project.id} className="flex items-start gap-2">
                    <span className="chip chip-plain">stalled</span>
                    <span className="min-w-0 flex-1 truncate">{project.title}</span>
                  </li>
                ))}
                {stuck.idleGoals.slice(0, 3).map((goal) => (
                  <li key={goal.id} className="flex items-start gap-2">
                    <span className="chip chip-plain">no progress</span>
                    <span className="min-w-0 flex-1 truncate">{goal.title}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card
            title="Recent notes"
            action={
              <Link href="/notes" className="btn btn-sm btn-ghost">
                All notes
              </Link>
            }
          >
            {notes.length ? (
              <ul className="flex flex-col">
                {notes.map((note) => (
                  <li key={note.id}>
                    <Link
                      href={`/notes/${note.id}`}
                      className="block rounded-lg px-2 py-1.5 hover:bg-surface-2"
                    >
                      <p className="truncate text-[13px]">{note.title}</p>
                      <p className="truncate text-[11px] text-muted">
                        {note.kind} · {note.updated_at.slice(0, 10)}
                        {note.project_title ? ` · ${note.project_title}` : ""}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No notes yet" hint="Capture a thought, then turn any line into a task." />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
