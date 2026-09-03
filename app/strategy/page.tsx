import Link from "next/link";
import {
  AddGoal, AddProject, AddStrategy, AddVision, ArchiveButton, MilestoneList, StatusSelect,
} from "@/components/strategy-forms";
import { EmptyState, Meter, PageHeader, StatTile, Tile } from "@/components/ui";
import {
  alignmentScore, getSettings, listAreas, listGoals, listMilestones, listProjects,
  listStrategies, listTasks, listVisions, timePerGoal,
} from "@/lib/queries";
import type { GoalView } from "@/lib/types";
import { cn, pct, addDaysISO, dotTone, formatDate, formatDuration, relativeDay, startOfWeekISO, todayISO } from "@/lib/util";

export const dynamic = "force-dynamic";

export default function StrategyPage() {
  const today = todayISO();
  const settings = getSettings();
  const weekStart = startOfWeekISO(today, settings.week_starts_on);
  const weekEnd = addDaysISO(weekStart, 6);

  const visions = listVisions();
  const goals = listGoals();
  const strategies = listStrategies();
  const projects = listProjects();
  const milestones = listMilestones();
  const areas = listAreas();
  const invested = timePerGoal(weekStart, weekEnd);
  const alignment = alignmentScore(weekStart, weekEnd);
  const unlinked = listTasks({}, today).filter((t) => !t.effective_goal_id).length;

  const goalsByVision = (visionId: string | null) =>
    goals.filter((goal) => (visionId ? goal.vision_id === visionId : !goal.vision_id));

  const goalBlock = (goal: GoalView) => (
    <GoalBlock
      key={goal.id}
      goal={goal}
      strategies={strategies.filter((s) => s.goal_id === goal.id)}
      projects={projects.filter(
        (p) => p.goal_id === goal.id || strategies.some((s) => s.id === p.strategy_id && s.goal_id === goal.id),
      )}
      milestones={milestones}
      areas={areas}
      minutes={invested.find((i) => i.goal_id === goal.id)?.minutes ?? 0}
      today={today}
    />
  );

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Strategy"
        subtitle="Vision → goal → strategy → project → task. Every level below inherits the one above."
        actions={<AddVision />}
      />

      <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile label="Visions" value={visions.length} />
        <StatTile label="Active goals" value={goals.filter((g) => g.status === "active").length} />
        <StatTile
          label="Alignment"
          value={`${alignment.score}%`}
          tone={alignment.score >= 70 ? "good" : alignment.score >= 40 ? "warn" : "bad"}
          sub="of this week's work serves a goal"
        />
        <StatTile
          label="Unlinked tasks"
          value={unlinked}
          tone={unlinked > 0 ? "warn" : "good"}
          sub="open tasks with no goal"
          href="/tasks?view=list"
        />
      </div>

      <div className="flex flex-col gap-4">
        {visions.map((vision) => (
          <Tile key={vision.id} className="gap-5">
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="tile-title">Vision{vision.horizon ? ` · ${vision.horizon}` : ""}</p>
                <h2 className="mt-1 text-2xl font-extrabold tracking-tight">{vision.title}</h2>
                {vision.description && (
                  <p className="mt-1 max-w-2xl text-sm text-muted">{vision.description}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <AddGoal visions={visions} areas={areas} visionId={vision.id} />
                <ArchiveButton kind="vision" id={vision.id} />
              </div>
            </header>

            <div className="flex flex-col divide-y divide-line">
              {goalsByVision(vision.id).map(goalBlock)}
              {goalsByVision(vision.id).length === 0 && (
                <p className="rounded-inner border border-dashed border-line px-4 py-5 text-center text-sm text-muted">
                  No goals under this vision yet.
                </p>
              )}
            </div>
          </Tile>
        ))}

        {(goalsByVision(null).length > 0 || visions.length === 0) && (
          <Tile className="gap-5">
            <header className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="tile-title">Standalone</p>
                <h2 className="mt-1 text-2xl font-extrabold tracking-tight">Goals without a vision</h2>
              </div>
              <AddGoal visions={visions} areas={areas} />
            </header>
            <div className="flex flex-col divide-y divide-line">
              {goalsByVision(null).map(goalBlock)}
              {goalsByVision(null).length === 0 && visions.length === 0 && (
                <EmptyState
                  title="Start with one long-term direction"
                  hint="Add a vision (3–5 years), then a goal for the next 6–12 months, then the strategy you will run for the next few weeks."
                />
              )}
            </div>
          </Tile>
        )}
      </div>
    </div>
  );
}

function GoalBlock({
  goal,
  strategies,
  projects,
  milestones,
  areas,
  minutes,
  today,
}: {
  goal: GoalView;
  strategies: ReturnType<typeof listStrategies>;
  projects: ReturnType<typeof listProjects>;
  milestones: ReturnType<typeof listMilestones>;
  areas: ReturnType<typeof listAreas>;
  minutes: number;
  today: string;
}) {
  return (
    <div className="flex flex-col gap-4 py-5 first:pt-0 last:pb-0">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-bold tracking-tight">{goal.title}</h3>
            {goal.area_name && <span className="tag">{goal.area_name}</span>}
            {goal.target_date && (
              <span className="tag">target {relativeDay(goal.target_date, today)}</span>
            )}
          </div>
          {goal.metric && <p className="mt-1 text-sm text-muted">Success: {goal.metric}</p>}
        </div>
        <div className="flex items-center gap-2">
          <StatusSelect kind="goal" id={goal.id} value={goal.status} options={["active", "paused", "done", "dropped"]} />
          <Link href={`/tasks?goal=${goal.id}`} className="btn btn-outline btn-sm">
            Tasks
          </Link>
          <ArchiveButton kind="goal" id={goal.id} />
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-semibold text-muted">
        <span className="w-48">
          <Meter value={goal.task_done} max={Math.max(goal.task_total, 1)} />
        </span>
        <span className="tabular-nums">
          {goal.task_done}/{goal.task_total} tasks · {pct(goal.task_done, goal.task_total)}%
        </span>
        <span>{goal.project_total} project{goal.project_total === 1 ? "" : "s"}</span>
        {minutes > 0 && <span>{formatDuration(minutes)} this week</span>}
        {goal.minutes_logged > 0 && <span>{formatDuration(goal.minutes_logged)} total</span>}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="flex flex-col gap-2">
          <p className="tile-title">Strategies · 1–12 weeks</p>
          <div className="flex flex-col">
            {strategies.map((strategy) => (
              <div key={strategy.id} className="list-row items-start">
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold">{strategy.title}</p>
                  {strategy.description && (
                    <p className="mt-0.5 text-sm text-muted">{strategy.description}</p>
                  )}
                </div>
                <span className="tag shrink-0">
                  {formatDate(strategy.start_date) || "—"} → {formatDate(strategy.end_date) || "—"}
                </span>
              </div>
            ))}
            {!strategies.length && (
              <p className="text-sm text-muted">No strategy yet — what is the bet for the next few weeks?</p>
            )}
          </div>
          <div className="self-start">
            <AddStrategy goalId={goal.id} />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <p className="tile-title">Projects</p>
          <div className="flex flex-col">
            {projects.map((project) => (
              <div key={project.id} className="list-row flex-col items-stretch gap-2">
                <div className="flex items-center justify-between gap-2">
                  <Link
                    href={`/projects/${project.id}`}
                    className="flex min-w-0 items-center gap-2 text-base font-semibold hover:text-accent"
                  >
                    <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", dotTone(project.color))} />
                    <span className="truncate">{project.title}</span>
                  </Link>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-xs font-semibold tabular-nums text-muted">
                      {project.task_done}/{project.task_total}
                    </span>
                    <StatusSelect
                      kind="project"
                      id={project.id}
                      value={project.status}
                      options={["planned", "active", "paused", "done"]}
                    />
                  </div>
                </div>
                <Meter value={project.task_done} max={Math.max(project.task_total, 1)} />
                <MilestoneList
                  projectId={project.id}
                  milestones={milestones.filter((m) => m.project_id === project.id)}
                />
              </div>
            ))}
            {!projects.length && <p className="text-sm text-muted">No projects under this goal.</p>}
          </div>
          <div className="self-start">
            <AddProject goalId={goal.id} strategies={strategies} areas={areas} />
          </div>
        </div>
      </div>
    </div>
  );
}
