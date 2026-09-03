import Link from "next/link";
import { IconArrowRight, IconCalendar, IconExternal, IconStar } from "@/components/icons";
import { TaskList } from "@/components/task-list";
import { EmptyState, Ladder, Meter, MiniBars, PageHeader, Ring, Tile } from "@/components/ui";
import {
  capacityForDay, getSettings, listAreas, listNotes, listProjects, listTasks,
  loggedMinutesByDay, projectFocusScore, stuckItems, timePerProject, weekStats,
} from "@/lib/queries";
import { NOTE_KIND_LABEL, type NoteKind, type TaskView } from "@/lib/types";
import {
  addDaysISO, cn, formatClock, formatDateLong, formatDuration, pct, relativeDay,
  startOfWeekISO, todayISO, weekDates,
} from "@/lib/util";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  await requireUser();
  const today = todayISO();
  const clock = new Date();
  const nowMin = clock.getHours() * 60 + clock.getMinutes();
  const settings = getSettings();
  const weekStart = startOfWeekISO(today, settings.week_starts_on);
  const weekEnd = addDaysISO(weekStart, 6);

  const focus = listTasks({ focusDate: today, includeDone: true }, today);
  const scheduled = listTasks({ scheduledOn: today, parentId: null }, today);
  const overdue = listTasks({ dueBefore: today, parentId: null }, today);
  const inbox = listTasks({ status: ["inbox"], parentId: null }, today);
  const openTasks = listTasks({ parentId: null }, today);
  const capacity = capacityForDay(today);
  const inProject = projectFocusScore(weekStart, weekEnd);
  const week = weekStats(weekStart, weekEnd);
  const projects = listProjects({ status: "active" });
  const invested = timePerProject(weekStart, weekEnd);
  const stuck = stuckItems(today);
  const notes = listNotes({ limit: 4 });
  const areas = listAreas();

  const loggedByDay = new Map<string, number>(weekDates(weekStart).map((day) => [day, 0]));
  for (const row of loggedMinutesByDay(weekStart, weekEnd)) loggedByDay.set(row.date, row.minutes);

  /* The spotlight: the block running now, else the next one today, else Big 3 #1. */
  const blocks = scheduled
    .filter((t) => t.start_min != null && t.status !== "done")
    .sort((a, b) => a.start_min! - b.start_min!);
  const running = blocks.find((t) => t.start_min! <= nowMin && (t.end_min ?? t.start_min! + 60) > nowMin);
  const upcoming = blocks.find((t) => t.start_min! > nowMin);
  const firstFocus = focus.find((t) => t.status !== "done");
  const spotlight = running ?? upcoming ?? firstFocus ?? null;
  const spotlightKind = running ? "now" : upcoming ? "next" : firstFocus ? "focus" : null;

  /* Every task appears once on this page. */
  const focusIds = new Set(focus.map((t) => t.id));
  const overdueIds = new Set(overdue.map((t) => t.id));
  const laterToday = scheduled.filter((t) => !focusIds.has(t.id) && t.id !== spotlight?.id);
  const inboxOnly = inbox.filter((t) => !overdueIds.has(t.id) && !focusIds.has(t.id));

  const byArea = areas
    .map((area) => ({ ...area, count: openTasks.filter((t) => t.area_name === area.name).length }))
    .sort((a, b) => b.count - a.count);

  const drifting = stuck.postponed.length + stuck.staleProjects.length + stuck.idleGoals.length;

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        eyebrow={formatDateLong(today)}
        title="Today"
        actions={
          <>
            <Link href="/review?kind=daily" className="btn btn-outline">
              Daily review
            </Link>
            <Link href="/calendar?view=day" className="btn btn-outline">
              <IconCalendar className="h-4 w-4" />
              Calendar
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
        {/* ------------------------------------------------------ spotlight */}
        <Tile accent className="justify-between md:col-span-7 md:min-h-[236px]">
          {spotlight ? (
            <Spotlight task={spotlight} kind={spotlightKind!} nowMin={nowMin} today={today} />
          ) : (
            <>
              <span className="tag tag-on-dark self-start">Nothing planned yet</span>
              <div className="flex flex-col gap-2">
                <p className="text-2xl font-extrabold tracking-tight lg:text-3xl">
                  What would make today a win?
                </p>
                <p className="text-sm text-accent-deep-ink/75">
                  Star one to three tasks below, or block time for one on the calendar.
                </p>
              </div>
              <div className="flex gap-2">
                <Link href="/calendar?view=day" className="btn bg-white text-accent-deep hover:bg-white/90">
                  Plan the day
                </Link>
              </div>
            </>
          )}
        </Tile>

        <Tile className="md:col-span-5 md:flex-row md:items-center md:gap-6">
          <Ring
            value={capacity.planned}
            max={capacity.capacity}
            tone={capacity.over ? "warn" : "accent"}
            className="self-center"
          />
          <div className="flex min-w-0 flex-col gap-1.5">
            <p className="tile-title">Capacity</p>
            <p className="text-2xl font-extrabold tracking-tight">
              {formatDuration(capacity.planned) || "0m"}{" "}
              <span className="text-lg font-semibold text-muted">of {formatDuration(capacity.capacity)} planned</span>
            </p>
            <p className="text-sm text-muted">
              {capacity.over
                ? "Over capacity — move or drop something before the day decides for you."
                : capacity.capacity - capacity.planned >= 60
                  ? `Room for ${formatDuration(capacity.capacity - capacity.planned)} more of focused work.`
                  : "The day is full. Protect what is already on it."}
            </p>
          </div>
        </Tile>

        {/* ---------------------------------------------------------- lists */}
        <Tile
          title="Big 3"
          hint="The one to three things that make today a win"
          action={<span className="tag tabular-nums">{focus.length} of 3</span>}
          className="md:col-span-6 xl:col-span-5"
        >
          {focus.length > 0 ? (
            <TaskList tasks={focus} today={today} showFocus showSchedule={false} />
          ) : null}
          {focus.length < 3 && (
            <div className={cn("flex flex-col", focus.length > 0 && "border-t border-line pt-3")}>
              {Array.from({ length: 3 - focus.length }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 py-2 text-sm text-muted">
                  <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[8px] border-2 border-dashed border-line-strong text-[11px] font-bold">
                    {focus.length + i + 1}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <IconStar className="h-3.5 w-3.5" />
                    {i === 0 && focus.length === 0 ? "Star a task anywhere to make it one of the three" : "Optional"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Tile>

        <Tile
          title={`Inbox · ${inboxOnly.length}`}
          hint="Unsorted captures — give each one a project or a day"
          action={
            <Link href="/tasks?view=list&status=inbox" className="btn btn-sm btn-ghost">
              Triage
            </Link>
          }
          className="md:col-span-6 xl:col-span-4"
        >
          <TaskList
            tasks={inboxOnly.slice(0, 5)}
            today={today}
            showFocus
            empty="Inbox is empty. Nice."
          />
        </Tile>

        <Tile title="Areas" hint="Open tasks by area" className="md:col-span-12 xl:col-span-3">
          {byArea.length ? (
            <div className="grid grid-cols-2 gap-2 xl:grid-cols-1">
              {byArea.map((area) => (
                <Link
                  key={area.id}
                  href={`/tasks?area=${area.id}`}
                  className={cn(
                    "flex items-center justify-between rounded-inner px-4 py-3 text-sm font-semibold transition hover:brightness-95",
                    "tone-tile",
                    `tone-${area.color}`,
                  )}
                >
                  {area.name}
                  <span className="text-lg font-extrabold tabular-nums">{area.count}</span>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState compact title="No areas yet" hint="Add Work, Health, Learning… in Settings." />
          )}
        </Tile>

        {laterToday.length > 0 && (
          <Tile
            title="Also today"
            hint="Scheduled, not in the Big 3"
            action={<span className="tag tabular-nums">{laterToday.length}</span>}
            className={cn("md:col-span-6", overdue.length === 0 && "md:col-span-12")}
          >
            <TaskList tasks={laterToday} today={today} showFocus showSchedule={false} />
          </Tile>
        )}

        {overdue.length > 0 && (
          <Tile
            title="Overdue"
            hint="Past their deadline — reschedule or drop them"
            action={<span className="tag tag-danger tabular-nums">{overdue.length}</span>}
            className={cn("md:col-span-6", laterToday.length === 0 && "md:col-span-12")}
          >
            <TaskList tasks={overdue} today={today} showFocus />
          </Tile>
        )}

        {/* --------------------------------------------------------- signals */}
        <Tile title="This week" className="md:col-span-6 xl:col-span-3">
          <div className="flex items-baseline gap-2">
            <span
              className={cn(
                "text-3xl font-extrabold tracking-tight tabular-nums",
                inProject.score >= 70 ? "text-accent" : inProject.score >= 40 ? "text-warn" : "text-danger",
              )}
            >
              {inProject.score}%
            </span>
            <span className="text-xs text-muted">of work serves a goal</span>
          </div>
          <MiniBars
            data={weekDates(weekStart).map((date) => ({
              label: relativeDay(date, today) === "Today" ? "Today" : date.slice(8),
              value: loggedByDay.get(date) ?? 0,
              emphasis: date === today,
              title: `${relativeDay(date, today)}: ${formatDuration(loggedByDay.get(date) ?? 0) || "0m"} logged`,
            }))}
          />
          <p className="text-xs text-muted">
            {week.completed} done · {formatDuration(week.loggedMinutes) || "0m"} logged
          </p>
        </Tile>

        <Tile
          title="Projects"
          action={
            <Link href="/projects" className="btn btn-sm btn-ghost">
              All
            </Link>
          }
          className="md:col-span-6 xl:col-span-3"
        >
          {projects.length ? (
            <ul className="flex flex-col gap-3.5">
              {projects.slice(0, 4).map((project) => {
                const minutes = invested.find((i) => i.project_id === project.id)?.minutes ?? 0;
                return (
                  <li key={project.id} className="flex flex-col gap-1.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <Link href={`/projects/${project.id}`} className="truncate text-sm font-semibold hover:text-accent">
                        {project.title}
                      </Link>
                      <span className="shrink-0 text-xs font-semibold tabular-nums text-muted">
                        {project.task_done} / {project.task_total}
                      </span>
                    </div>
                    <Meter value={project.task_done} max={Math.max(project.task_total, 1)} />
                    <p className="text-xs text-muted">
                      {pct(project.task_done, project.task_total)}% done
                      {project.due_date ? ` · due ${relativeDay(project.due_date, today)}` : ""}
                      {minutes ? ` · ${formatDuration(minutes)} this week` : ""}
                    </p>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState
              compact
              title="No active projects"
              hint="A project groups a piece of work with its tasks and notes."
              action={
                <Link href="/projects" className="btn btn-sm btn-primary">
                  Create a project
                </Link>
              }
            />
          )}
        </Tile>

        <Tile title="Needs attention" hint="Slipping, stalled, or drifting" className="md:col-span-6 xl:col-span-3">
          {drifting ? (
            <ul className="flex flex-col">
              {stuck.postponed.slice(0, 3).map((task) => (
                <li key={task.id} className="list-row">
                  <span className="tag tag-warn">×{task.postponed_count}</span>
                  <Link href={`/tasks/${task.id}`} className="min-w-0 flex-1 truncate text-sm font-semibold hover:text-accent">
                    {task.title}
                  </Link>
                </li>
              ))}
              {stuck.staleProjects.slice(0, 2).map((project) => (
                <li key={project.id} className="list-row">
                  <span className="tag">stalled</span>
                  <Link href={`/projects/${project.id}`} className="min-w-0 flex-1 truncate text-sm font-semibold hover:text-accent">
                    {project.title}
                  </Link>
                </li>
              ))}
              {stuck.idleGoals.slice(0, 2).map((goal) => (
                <li key={goal.id} className="list-row">
                  <span className="tag">idle</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{goal.title}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState compact title="Nothing is drifting" hint="No repeated postponements, stalled projects or idle goals." />
          )}
        </Tile>

        <Tile
          title="Notes"
          action={
            <Link href="/notes" className="btn btn-sm btn-ghost">
              All
            </Link>
          }
          className="md:col-span-6 xl:col-span-3"
        >
          {notes.length ? (
            <ul className="flex flex-col">
              {notes.map((note) => (
                <li key={note.id} className="list-row">
                  <Link href={`/notes/${note.id}`} className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold hover:text-accent">
                      {note.icon ? `${note.icon} ` : ""}
                      {note.title || "Untitled"}
                    </p>
                    <p className="truncate text-xs text-muted">
                      {NOTE_KIND_LABEL[note.kind as NoteKind]}
                      {note.project_title ? ` · ${note.project_title}` : ""}
                    </p>
                  </Link>
                  <IconExternal className="h-4 w-4 shrink-0 text-line-strong" />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState compact title="No notes yet" hint="Capture a thought, then turn any line into a task." />
          )}
        </Tile>
      </div>
    </div>
  );
}

function Spotlight({
  task,
  kind,
  nowMin,
  today,
}: {
  task: TaskView;
  kind: "now" | "next" | "focus";
  nowMin: number;
  today: string;
}) {
  const start = task.start_min ?? 0;
  const end = task.end_min ?? start + 60;
  const label =
    kind === "now"
      ? `Now · ${formatClock(start)} – ${formatClock(end)}`
      : kind === "next"
        ? `Next · ${formatClock(start)}`
        : "Big 3 · first";

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className="tag tag-on-dark">{label}</span>
        {kind === "now" && (
          <span className="text-xs font-semibold text-accent-deep-ink/70">{formatDuration(end - nowMin)} left</span>
        )}
        {kind === "next" && (
          <span className="text-xs font-semibold text-accent-deep-ink/70">in {formatDuration(start - nowMin)}</span>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <Link
          href={`/tasks/${task.id}`}
          className="text-2xl font-extrabold leading-tight tracking-tight hover:underline lg:text-3xl"
        >
          {task.title}
        </Link>
        <Ladder
          onDark
          project={task.project_title}
          projectColor={task.project_color}
          goal={task.goal_title}
          area={task.area_name}
          className="text-sm"
        />
        {task.next_action && (
          <p className="text-sm text-accent-deep-ink/80">
            <span className="font-semibold">Next: </span>
            {task.next_action}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {task.subtask_total > 0 && (
          <span className="tag tag-on-dark tabular-nums">
            {task.subtask_done} of {task.subtask_total} steps
          </span>
        )}
        {task.estimate_minutes ? <span className="tag tag-on-dark">{formatDuration(task.estimate_minutes)}</span> : null}
        {task.due_date && <span className="tag tag-on-dark">due {relativeDay(task.due_date, today)}</span>}
        <Link href={`/tasks/${task.id}`} className="btn ml-auto bg-white text-accent-deep hover:bg-white/90">
          Open task
          <IconArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </>
  );
}
