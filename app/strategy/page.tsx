import Link from "next/link";
import {
  AddGoal, AddProject, AddStrategy, AddVision, ArchiveButton, MilestoneList, StatusSelect,
} from "@/components/strategy-forms";
import { EmptyState, Meter, PageHeader, StatTile } from "@/components/ui";
import {
  alignmentScore, getSettings, listAreas, listGoals, listMilestones, listProjects,
  listStrategies, listTasks, listVisions, timePerGoal,
} from "@/lib/queries";
import type { GoalView } from "@/lib/types";
import { cn, pct, addDaysISO, dotTone, formatDuration, relativeDay, startOfWeekISO, todayISO } from "@/lib/util";

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

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Strategy"
        subtitle="Vision → goal → strategy → project → task. Every level below inherits the one above."
        actions={<AddVision />}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
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

      <div className="flex flex-col gap-5">
        {visions.map((vision) => (
          <section key={vision.id} className="card p-4">
            <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="section-title">Vision{vision.horizon ? ` · ${vision.horizon}` : ""}</p>
                <h2 className="text-[16px] font-semibold">{vision.title}</h2>
                {vision.description && (
                  <p className="mt-1 max-w-2xl text-[12.5px] text-muted">{vision.description}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <AddGoal visions={visions} areas={areas} visionId={vision.id} />
                <ArchiveButton kind="vision" id={vision.id} />
              </div>
            </header>

            <div className="flex flex-col gap-3">
              {goalsByVision(vision.id).map((goal) => (
                <GoalBlock
                  key={goal.id}
                  goal={goal}
                  strategies={strategies.filter((s) => s.goal_id === goal.id)}
                  projects={projects.filter((p) => p.goal_id === goal.id || strategies.some((s) => s.id === p.strategy_id && s.goal_id === goal.id))}
                  milestones={milestones}
                  areas={areas}
                  minutes={invested.find((i) => i.goal_id === goal.id)?.minutes ?? 0}
                  today={today}
                />
              ))}
              {goalsByVision(vision.id).length === 0 && (
                <p className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-[12.5px] text-muted">
                  No goals under this vision yet.
                </p>
              )}
            </div>
          </section>
        ))}

        <section className="card p-4">
          <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="section-title">Standalone</p>
              <h2 className="text-[15px] font-semibold">Goals without a vision</h2>
            </div>
            <AddGoal visions={visions} areas={areas} />
          </header>
          <div className="flex flex-col gap-3">
            {goalsByVision(null).map((goal) => (
              <GoalBlock
                key={goal.id}
                goal={goal}
                strategies={strategies.filter((s) => s.goal_id === goal.id)}
                projects={projects.filter((p) => p.goal_id === goal.id || strategies.some((s) => s.id === p.strategy_id && s.goal_id === goal.id))}
                milestones={milestones}
                areas={areas}
                minutes={invested.find((i) => i.goal_id === goal.id)?.minutes ?? 0}
                today={today}
              />
            ))}
            {goalsByVision(null).length === 0 && visions.length === 0 && (
              <EmptyState
                title="Start with one long-term direction"
                hint="Add a vision (3–5 years), then a goal for the next 6–12 months, then the strategy you will run for the next few weeks."
              />
            )}
          </div>
        </section>
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
    <div className="rounded-xl border border-line bg-surface-2/40 p-3">
      <header className="mb-2 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[14px] font-semibold">{goal.title}</h3>
            {goal.area_name && <span className="chip chip-plain">{goal.area_name}</span>}
            {goal.target_date && (
              <span className="chip chip-plain">target {relativeDay(goal.target_date, today)}</span>
            )}
          </div>
          {goal.metric && <p className="mt-0.5 text-[12px] text-muted">Success: {goal.metric}</p>}
        </div>
        <div className="flex items-center gap-2">
          <StatusSelect kind="goal" id={goal.id} value={goal.status} options={["active", "paused", "done", "dropped"]} />
          <Link href={`/tasks?goal=${goal.id}`} className="btn btn-sm">
            Tasks
          </Link>
          <ArchiveButton kind="goal" id={goal.id} />
        </div>
      </header>

      <div className="mb-3 flex flex-wrap items-center gap-3 text-[11.5px] text-muted">
        <span className="w-48">
          <Meter value={goal.task_done} max={Math.max(goal.task_total, 1)} />
        </span>
        <span>
          {goal.task_done}/{goal.task_total} tasks ({pct(goal.task_done, goal.task_total)}%)
        </span>
        <span>{goal.project_total} projects</span>
        {minutes > 0 && <span>{formatDuration(minutes)} this week</span>}
        {goal.minutes_logged > 0 && <span>{formatDuration(goal.minutes_logged)} total</span>}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div>
          <p className="section-title mb-1.5">Short-term strategies (1–12 weeks)</p>
          <div className="flex flex-col gap-1.5">
            {strategies.map((strategy) => (
              <div key={strategy.id} className="rounded-lg border border-line bg-surface p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[13px] font-medium">{strategy.title}</p>
                  <span className="chip chip-plain shrink-0">
                    {strategy.start_date ?? "—"} → {strategy.end_date ?? "—"}
                  </span>
                </div>
                {strategy.description && (
                  <p className="mt-1 text-[12px] text-muted">{strategy.description}</p>
                )}
              </div>
            ))}
            {!strategies.length && (
              <p className="text-[12px] text-muted">
                No strategy yet — what is the bet for the next few weeks?
              </p>
            )}
            <AddStrategy goalId={goal.id} />
          </div>
        </div>

        <div>
          <p className="section-title mb-1.5">Projects</p>
          <div className="flex flex-col gap-1.5">
            {projects.map((project) => (
              <div key={project.id} className="rounded-lg border border-line bg-surface p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <Link
                    href={`/tasks?project=${project.id}`}
                    className="flex min-w-0 items-center gap-2 text-[13px] font-medium hover:text-accent"
                  >
                    <span className={cn("h-2 w-2 shrink-0 rounded-full", dotTone(project.color))} />
                    <span className="truncate">{project.title}</span>
                  </Link>
                  <div className="flex shrink-0 items-center gap-1">
                    <span className="text-[11px] text-muted">
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
                <Meter
                  value={project.task_done}
                  max={Math.max(project.task_total, 1)}
                  className="mt-2"
                />
                <MilestoneList
                  projectId={project.id}
                  milestones={milestones.filter((m) => m.project_id === project.id)}
                />
              </div>
            ))}
            {!projects.length && <p className="text-[12px] text-muted">No projects under this goal.</p>}
            <AddProject goalId={goal.id} strategies={strategies} areas={areas} />
          </div>
        </div>
      </div>
    </div>
  );
}
