import Link from "next/link";
import { IconChevronLeft, IconChevronRight } from "@/components/icons";
import { ReviewForm } from "@/components/review-form";
import { TaskList } from "@/components/task-list";
import { EmptyState, Meter, PageHeader, SegLinks, StatTile, Tile } from "@/components/ui";
import {
  getReview, getSettings, listProjects, listTasks, loggedMinutesByDay,
  projectFocusScore, stuckItems, timePerProject,
} from "@/lib/queries";
import {
  addDaysISO, endOfMonthISO, formatDate, formatDateLong, formatDuration, monthKey, monthName,
  pct, startOfMonthISO, startOfWeekISO, todayISO, weekKey,
} from "@/lib/util";

export const dynamic = "force-dynamic";

const FIELDS = {
  daily: [
    { key: "done", label: "What did you finish today?", rows: 3 },
    { key: "blocked", label: "What got stuck, and why?", rows: 3 },
    { key: "learned", label: "What did today teach you?", rows: 2 },
    { key: "tomorrow", label: "The 1–3 things that matter tomorrow", rows: 3 },
  ],
  weekly: [
    { key: "moved", label: "Which projects actually moved this week?", rows: 3 },
    { key: "stalled", label: "What stalled — and is it the plan or the execution?", rows: 3 },
    { key: "strategy", label: "Does the current strategy still make sense?", rows: 3 },
    { key: "drop", label: "What will you stop doing?", rows: 2 },
    { key: "next", label: "Top 3 for next week", rows: 3 },
  ],
  monthly: [
    { key: "progress", label: "Progress on each project", rows: 4 },
    { key: "strategy", label: "Is the strategy still the right bet? What changed?", rows: 4 },
    { key: "reallocate", label: "Where should time move next month?", rows: 3 },
    { key: "revise", label: "Projects to revise, add or drop", rows: 3 },
  ],
} as const;

export default async function ReviewPage({ searchParams }: PageProps<"/review">) {
  const params = await searchParams;
  const pick = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const today = todayISO();
  const settings = getSettings();
  const kind = (pick("kind") ?? "daily") as "daily" | "weekly" | "monthly";
  const date = pick("date") ?? today;

  const from =
    kind === "daily" ? date : kind === "weekly" ? startOfWeekISO(date, settings.week_starts_on) : startOfMonthISO(date);
  const to = kind === "daily" ? date : kind === "weekly" ? addDaysISO(from, 6) : endOfMonthISO(date);
  const periodKey = kind === "daily" ? date : kind === "weekly" ? weekKey(date) : monthKey(date);

  const existing = getReview(kind, periodKey);
  const completed = listTasks(
    { status: ["done"], order: "t.completed_at DESC" },
    today,
  ).filter((t) => t.completed_at && t.completed_at.slice(0, 10) >= from && t.completed_at.slice(0, 10) <= to);
  const open = listTasks({ scheduledFrom: from, scheduledTo: to }, today);
  const stillOpen = open.filter((t) => t.status !== "done");
  const inProject = projectFocusScore(from, to);
  const invested = timePerProject(from, to);
  const projects = listProjects({ status: "active" });
  const stuck = stuckItems(today);
  const logged = loggedMinutesByDay(from, to);
  const totalLogged = logged.reduce((sum, row) => sum + row.minutes, 0);
  const drifting = stuck.postponed.length + stuck.staleProjects.length + stuck.idleGoals.length;

  const title =
    kind === "daily"
      ? formatDateLong(date)
      : kind === "weekly"
        ? `${formatDate(from)} — ${formatDate(to)}`
        : `${monthName(date)} ${date.slice(0, 4)}`;

  const shift = (delta: number) => {
    if (kind === "daily") return addDaysISO(date, delta);
    if (kind === "weekly") return addDaysISO(date, delta * 7);
    const d = new Date(`${startOfMonthISO(date)}T00:00:00`);
    d.setMonth(d.getMonth() + delta);
    return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-01`;
  };

  return (
    <div className="mx-auto max-w-[1300px]">
      <PageHeader
        eyebrow={`Review · ${periodKey}`}
        title={title}
        actions={
          <>
            <SegLinks
              value={kind}
              items={(["daily", "weekly", "monthly"] as const).map((k) => ({
                key: k,
                label: k[0].toUpperCase() + k.slice(1),
                href: `/review?kind=${k}&date=${date}`,
              }))}
            />
            <div className="flex items-center gap-1">
              <Link href={`/review?kind=${kind}&date=${shift(-1)}`} className="btn btn-outline btn-icon" aria-label="Previous period">
                <IconChevronLeft className="h-4 w-4" />
              </Link>
              <Link href={`/review?kind=${kind}&date=${today}`} className="btn btn-outline">
                Now
              </Link>
              <Link href={`/review?kind=${kind}&date=${shift(1)}`} className="btn btn-outline btn-icon" aria-label="Next period">
                <IconChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile label="Completed" value={completed.length} sub={`in this ${kind.replace("ly", "")}`} />
        <StatTile label="Still open" value={stillOpen.length} sub="scheduled in the period" />
        <StatTile label="Time logged" value={formatDuration(totalLogged) || "0m"} />
        <StatTile
          label="In a project"
          value={`${inProject.score}%`}
          tone={inProject.score >= 70 ? "good" : inProject.score >= 40 ? "warn" : "bad"}
          sub={`${inProject.grouped}/${inProject.total} tasks belong to a project`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <ReviewForm
            kind={kind}
            periodKey={periodKey}
            fields={[...FIELDS[kind]]}
            initial={existing?.data ?? {}}
          />

          {kind !== "daily" && (
            <Tile title="Project progress" hint="Where the period's effort actually landed">
              <ul className="flex flex-col gap-3.5">
                {projects.map((project) => {
                  const minutes = invested.find((i) => i.project_id === project.id)?.minutes ?? 0;
                  const doneThisPeriod = completed.filter((t) => t.project_id === project.id).length;
                  return (
                    <li key={project.id} className="flex flex-col gap-1.5">
                      <div className="flex items-baseline justify-between gap-2">
                        <Link href={`/projects/${project.id}`} className="truncate text-sm font-semibold hover:text-accent">
                          {project.title}
                        </Link>
                        <span className="shrink-0 text-xs font-semibold tabular-nums text-muted">
                          {doneThisPeriod} done · {formatDuration(minutes) || "0m"}
                        </span>
                      </div>
                      <Meter
                        value={project.task_done}
                        max={Math.max(project.task_total, 1)}
                        tone={doneThisPeriod > 0 ? "accent" : "muted"}
                      />
                      <p className="text-xs text-muted">
                        {pct(project.task_done, project.task_total)}% of all its tasks done
                        {doneThisPeriod === 0 && " · nothing moved in this period"}
                      </p>
                    </li>
                  );
                })}
                {!projects.length && <p className="text-sm text-muted">No active projects.</p>}
              </ul>
            </Tile>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <Tile title="Completed" action={<span className="tag tabular-nums">{completed.length}</span>}>
            <TaskList tasks={completed.slice(0, 15)} today={today} empty="Nothing completed yet." />
          </Tile>

          <Tile
            title="Still open in this period"
            hint="Reschedule, delegate or drop"
            action={<span className="tag tabular-nums">{stillOpen.length}</span>}
          >
            <TaskList tasks={stillOpen.slice(0, 15)} today={today} empty="Nothing left open." />
          </Tile>

          <Tile title="Drift check" hint="Repeatedly postponed, stalled or idle">
            {drifting ? (
              <ul className="flex flex-col">
                {stuck.postponed.map((task) => (
                  <li key={task.id} className="list-row">
                    <span className="tag tag-warn">×{task.postponed_count}</span>
                    <Link href={`/tasks/${task.id}`} className="min-w-0 flex-1 truncate text-sm font-semibold hover:text-accent">
                      {task.title}
                    </Link>
                  </li>
                ))}
                {stuck.staleProjects.map((project) => (
                  <li key={project.id} className="list-row">
                    <span className="tag">stalled</span>
                    <Link href={`/projects/${project.id}`} className="min-w-0 flex-1 truncate text-sm font-semibold hover:text-accent">
                      {project.title}
                    </Link>
                  </li>
                ))}
                {stuck.idleGoals.map((goal) => (
                  <li key={goal.id} className="list-row">
                    <span className="tag">idle goal</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{goal.title}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState compact title="Nothing is drifting" />
            )}
          </Tile>

          <Tile title="Time invested" hint={`${formatDuration(totalLogged) || "0m"} logged in this period`}>
            {invested.length ? (
              <ul className="flex flex-col gap-3">
                {invested.map((row) => (
                  <li key={row.project_id ?? "none"} className="flex flex-col gap-1.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-semibold">{row.project_title ?? "Not in a project"}</span>
                      <span className="shrink-0 text-xs font-semibold tabular-nums text-muted">
                        {formatDuration(row.minutes)}
                      </span>
                    </div>
                    <Meter
                      value={row.minutes}
                      max={Math.max(...invested.map((i) => i.minutes))}
                      tone={row.project_id ? "accent" : "warn"}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">
                No time logged yet. Log minutes on a task to see where the period actually went.
              </p>
            )}
          </Tile>
        </div>
      </div>
    </div>
  );
}
