import Link from "next/link";
import { ReviewForm } from "@/components/review-form";
import { TaskList } from "@/components/task-list";
import { Card, Meter, PageHeader, StatTile } from "@/components/ui";
import {
  alignmentScore, getReview, getSettings, listGoals, listTasks, loggedMinutesByDay,
  stuckItems, timePerGoal,
} from "@/lib/queries";
import {
  addDaysISO, endOfMonthISO, formatDate, formatDateLong, formatDuration, monthKey, monthName,
  pct, startOfMonthISO, startOfWeekISO, todayISO, weekKey,
} from "@/lib/util";
import { cn } from "@/lib/util";

export const dynamic = "force-dynamic";

const FIELDS = {
  daily: [
    { key: "done", label: "What did you finish today?", rows: 3 },
    { key: "blocked", label: "What got stuck, and why?", rows: 3 },
    { key: "learned", label: "What did today teach you?", rows: 2 },
    { key: "tomorrow", label: "The 1–3 things that matter tomorrow", rows: 3 },
  ],
  weekly: [
    { key: "moved", label: "Which goals actually moved this week?", rows: 3 },
    { key: "stalled", label: "What stalled — and is it the plan or the execution?", rows: 3 },
    { key: "strategy", label: "Does the current strategy still make sense?", rows: 3 },
    { key: "drop", label: "What will you stop doing?", rows: 2 },
    { key: "next", label: "Top 3 for next week", rows: 3 },
  ],
  monthly: [
    { key: "progress", label: "Progress against each goal", rows: 4 },
    { key: "strategy", label: "Is the strategy still the right bet? What changed?", rows: 4 },
    { key: "reallocate", label: "Where should time move next month?", rows: 3 },
    { key: "revise", label: "Goals to revise, add or drop", rows: 3 },
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
  const alignment = alignmentScore(from, to);
  const invested = timePerGoal(from, to);
  const goals = listGoals({ status: "active" });
  const stuck = stuckItems(today);
  const logged = loggedMinutesByDay(from, to);
  const totalLogged = logged.reduce((sum, row) => sum + row.minutes, 0);

  const title =
    kind === "daily"
      ? formatDateLong(date)
      : kind === "weekly"
        ? `${formatDate(from)} — ${formatDate(to)} · ${periodKey}`
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
        title="Review"
        subtitle={title}
        actions={
          <>
            <div className="flex rounded-lg border border-line bg-surface p-0.5">
              {(["daily", "weekly", "monthly"] as const).map((k) => (
                <Link
                  key={k}
                  href={`/review?kind=${k}&date=${date}`}
                  className={cn(
                    "rounded-[7px] px-2.5 py-1.5 text-[12.5px] font-medium capitalize transition",
                    kind === k ? "bg-surface-3 text-ink" : "text-muted hover:text-ink",
                  )}
                >
                  {k}
                </Link>
              ))}
            </div>
            <Link href={`/review?kind=${kind}&date=${shift(-1)}`} className="btn btn-sm">
              ←
            </Link>
            <Link href={`/review?kind=${kind}&date=${today}`} className="btn btn-sm">
              Now
            </Link>
            <Link href={`/review?kind=${kind}&date=${shift(1)}`} className="btn btn-sm">
              →
            </Link>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Completed" value={completed.length} sub={`in this ${kind.replace("ly", "")} period`} />
        <StatTile label="Still open" value={open.filter((t) => t.status !== "done").length} />
        <StatTile label="Time logged" value={formatDuration(totalLogged) || "0m"} />
        <StatTile
          label="Alignment"
          value={`${alignment.score}%`}
          tone={alignment.score >= 70 ? "good" : alignment.score >= 40 ? "warn" : "bad"}
          sub={`${alignment.aligned}/${alignment.total} tasks serve a goal`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <ReviewForm
            kind={kind}
            periodKey={periodKey}
            fields={[...FIELDS[kind]]}
            initial={existing?.data ?? {}}
          />

          {kind !== "daily" && (
            <Card title="Goal progress" hint="Where the period's effort actually landed">
              <ul className="flex flex-col gap-3">
                {goals.map((goal) => {
                  const minutes = invested.find((i) => i.goal_id === goal.id)?.minutes ?? 0;
                  const doneThisPeriod = completed.filter((t) => t.effective_goal_id === goal.id).length;
                  return (
                    <li key={goal.id}>
                      <div className="mb-1 flex items-baseline justify-between gap-2">
                        <span className="truncate text-[13px]">{goal.title}</span>
                        <span className="shrink-0 text-[11px] tabular-nums text-muted">
                          {doneThisPeriod} done · {formatDuration(minutes) || "0m"}
                        </span>
                      </div>
                      <Meter
                        value={goal.task_done}
                        max={Math.max(goal.task_total, 1)}
                        tone={doneThisPeriod > 0 ? "accent" : "muted"}
                      />
                      <p className="mt-1 text-[11px] text-muted">
                        {pct(goal.task_done, goal.task_total)}% of all its tasks done
                        {doneThisPeriod === 0 && " · nothing moved in this period"}
                      </p>
                    </li>
                  );
                })}
                {!goals.length && <p className="text-[12.5px] text-muted">No active goals.</p>}
              </ul>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <Card title="Completed" hint={`${completed.length} task(s)`}>
            <TaskList tasks={completed.slice(0, 15)} today={today} empty="Nothing completed yet." />
          </Card>

          <Card title="Still open in this period" hint="Reschedule, delegate or drop">
            <TaskList
              tasks={open.filter((t) => t.status !== "done").slice(0, 15)}
              today={today}
              empty="Nothing left open."
            />
          </Card>

          {(stuck.postponed.length > 0 || stuck.staleProjects.length > 0 || stuck.idleGoals.length > 0) && (
            <Card title="Drift check" hint="Repeatedly postponed, stalled or idle">
              <ul className="flex flex-col gap-2 text-[12.5px]">
                {stuck.postponed.map((task) => (
                  <li key={task.id} className="flex items-center gap-2">
                    <span className="chip border-warn/30 bg-warn/10 text-warn">×{task.postponed_count}</span>
                    <Link href={`/tasks/${task.id}`} className="truncate hover:text-accent">
                      {task.title}
                    </Link>
                  </li>
                ))}
                {stuck.staleProjects.map((project) => (
                  <li key={project.id} className="flex items-center gap-2">
                    <span className="chip chip-plain">stalled project</span>
                    <span className="truncate">{project.title}</span>
                  </li>
                ))}
                {stuck.idleGoals.map((goal) => (
                  <li key={goal.id} className="flex items-center gap-2">
                    <span className="chip chip-plain">idle goal</span>
                    <span className="truncate">{goal.title}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card title="Time invested" hint={`${formatDuration(totalLogged) || "0m"} logged in this period`}>
            {invested.length ? (
              <ul className="flex flex-col gap-2">
                {invested.map((row) => (
                  <li key={row.goal_id ?? "none"}>
                    <div className="mb-1 flex items-baseline justify-between gap-2">
                      <span className="truncate text-[12.5px]">{row.goal_title ?? "Not linked to a goal"}</span>
                      <span className="shrink-0 text-[11px] tabular-nums text-muted">
                        {formatDuration(row.minutes)}
                      </span>
                    </div>
                    <Meter
                      value={row.minutes}
                      max={Math.max(...invested.map((i) => i.minutes))}
                      tone={row.goal_id ? "accent" : "warn"}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[12.5px] text-muted">
                No time logged yet. Log minutes on a task to see where the period actually went.
              </p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
