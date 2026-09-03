"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createGoal, createMilestone, createProject, createStrategy, createVision,
  toggleMilestone, updateGoal, updateProject, updateStrategy, updateVision,
} from "@/lib/actions";
import type { Area, Milestone, Strategy, Vision } from "@/lib/types";
import { COLORS, cn } from "@/lib/util";
import { IconDiamond, IconPlus } from "./icons";

function useAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return {
    pending,
    run: (fn: () => Promise<unknown>, after?: () => void) =>
      startTransition(async () => {
        await fn();
        after?.();
        router.refresh();
      }),
  };
}

function Disclosure({
  label,
  children,
  className,
  primary = false,
}: {
  label: string;
  children: (close: () => void) => React.ReactNode;
  className?: string;
  primary?: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn("btn btn-sm", primary ? "btn-primary" : "btn-ghost", className)}
      >
        <IconPlus className="h-4 w-4" />
        {label}
      </button>
    );
  }
  return (
    <div className={cn("rounded-inner border border-line bg-surface-2 p-4", className)}>
      {children(() => setOpen(false))}
    </div>
  );
}

function FormActions({
  label,
  disabled,
  onSubmit,
  onCancel,
}: {
  label: string;
  disabled: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex gap-2">
      <button type="button" className="btn btn-primary btn-sm" disabled={disabled} onClick={onSubmit}>
        {label}
      </button>
      <button type="button" className="btn btn-outline btn-sm" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}

export function AddVision() {
  const { run, pending } = useAction();
  const [form, setForm] = useState({ title: "", horizon: "", description: "" });

  return (
    <Disclosure label="Add vision" primary className="w-full sm:w-auto">
      {(close) => (
        <div className="flex w-full flex-col gap-2 sm:w-[520px]">
          <input
            className="input"
            placeholder="Long-term vision — the direction, not the task"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            autoFocus
          />
          <div className="flex gap-2">
            <input
              className="input w-40"
              placeholder="Horizon (3 years)"
              value={form.horizon}
              onChange={(e) => setForm({ ...form, horizon: e.target.value })}
            />
            <input
              className="input"
              placeholder="What does it look like when it is true?"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <FormActions
            label="Create vision"
            disabled={pending || !form.title.trim()}
            onSubmit={() => run(() => createVision(form), close)}
            onCancel={close}
          />
        </div>
      )}
    </Disclosure>
  );
}

export function AddGoal({
  visions,
  areas,
  visionId,
}: {
  visions: Vision[];
  areas: Area[];
  visionId?: string;
}) {
  const { run, pending } = useAction();
  const [form, setForm] = useState({
    title: "",
    vision_id: visionId ?? "",
    area_id: "",
    metric: "",
    target_date: "",
  });

  return (
    <Disclosure label="Add goal">
      {(close) => (
        <div className="flex flex-col gap-2">
          <input
            className="input"
            placeholder="Goal for the next 6–12 months"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            autoFocus
          />
          <input
            className="input"
            placeholder="How will you know it succeeded? (metric)"
            value={form.metric}
            onChange={(e) => setForm({ ...form, metric: e.target.value })}
          />
          <div className="flex flex-wrap gap-2">
            {!visionId && (
              <select
                className="input w-auto"
                value={form.vision_id}
                onChange={(e) => setForm({ ...form, vision_id: e.target.value })}
              >
                <option value="">No vision</option>
                {visions.map((vision) => (
                  <option key={vision.id} value={vision.id}>
                    {vision.title}
                  </option>
                ))}
              </select>
            )}
            <select
              className="input w-auto"
              value={form.area_id}
              onChange={(e) => setForm({ ...form, area_id: e.target.value })}
            >
              <option value="">No area</option>
              {areas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.name}
                </option>
              ))}
            </select>
            <input
              type="date"
              className="input w-auto"
              value={form.target_date}
              onChange={(e) => setForm({ ...form, target_date: e.target.value })}
            />
          </div>
          <FormActions
            label="Create goal"
            disabled={pending || !form.title.trim()}
            onSubmit={() => run(() => createGoal(form), close)}
            onCancel={close}
          />
        </div>
      )}
    </Disclosure>
  );
}

export function AddStrategy({ goalId }: { goalId: string }) {
  const { run, pending } = useAction();
  const [form, setForm] = useState({ title: "", description: "", start_date: "", end_date: "" });

  return (
    <Disclosure label="Add strategy">
      {(close) => (
        <div className="flex flex-col gap-2">
          <input
            className="input"
            placeholder="Short-term strategy (1–12 weeks) — the bet you are making now"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            autoFocus
          />
          <input
            className="input"
            placeholder="Why this bet, and what would prove it wrong?"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <div className="flex gap-2">
            <input
              type="date"
              className="input w-auto"
              value={form.start_date}
              onChange={(e) => setForm({ ...form, start_date: e.target.value })}
            />
            <input
              type="date"
              className="input w-auto"
              value={form.end_date}
              onChange={(e) => setForm({ ...form, end_date: e.target.value })}
            />
          </div>
          <FormActions
            label="Create strategy"
            disabled={pending || !form.title.trim()}
            onSubmit={() => run(() => createStrategy({ ...form, goal_id: goalId }), close)}
            onCancel={close}
          />
        </div>
      )}
    </Disclosure>
  );
}

export function AddProject({
  goalId,
  strategies,
  areas,
}: {
  goalId: string;
  strategies: Strategy[];
  areas: Area[];
}) {
  const { run, pending } = useAction();
  const [form, setForm] = useState({
    title: "",
    strategy_id: "",
    area_id: "",
    due_date: "",
    color: "indigo",
  });

  return (
    <Disclosure label="Add project">
      {(close) => (
        <div className="flex flex-col gap-2">
          <input
            className="input"
            placeholder="Project — a finishable chunk of the strategy"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            autoFocus
          />
          <div className="flex flex-wrap gap-2">
            <select
              className="input w-auto"
              value={form.strategy_id}
              onChange={(e) => setForm({ ...form, strategy_id: e.target.value })}
            >
              <option value="">No strategy</option>
              {strategies.map((strategy) => (
                <option key={strategy.id} value={strategy.id}>
                  {strategy.title}
                </option>
              ))}
            </select>
            <select
              className="input w-auto"
              value={form.area_id}
              onChange={(e) => setForm({ ...form, area_id: e.target.value })}
            >
              <option value="">No area</option>
              {areas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.name}
                </option>
              ))}
            </select>
            <input
              type="date"
              className="input w-auto"
              value={form.due_date}
              onChange={(e) => setForm({ ...form, due_date: e.target.value })}
            />
            <select
              className="input w-auto capitalize"
              value={form.color}
              onChange={(e) => setForm({ ...form, color: e.target.value })}
            >
              {COLORS.map((color) => (
                <option key={color} value={color}>
                  {color}
                </option>
              ))}
            </select>
          </div>
          <FormActions
            label="Create project"
            disabled={pending || !form.title.trim()}
            onSubmit={() => run(() => createProject({ ...form, goal_id: goalId }), close)}
            onCancel={close}
          />
        </div>
      )}
    </Disclosure>
  );
}

export function MilestoneList({
  projectId,
  milestones,
}: {
  projectId: string;
  milestones: Milestone[];
}) {
  const { run } = useAction();
  const [form, setForm] = useState({ title: "", date: "" });

  return (
    <div className="flex flex-col gap-2">
      {milestones.length > 0 && (
        <ul className="flex flex-col gap-1">
          {milestones.map((milestone) => (
            <li key={milestone.id} className="flex items-center gap-2 text-sm">
              <button
                type="button"
                onClick={() => run(() => toggleMilestone(milestone.id))}
                className={cn(
                  "flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md transition hover:bg-surface-3",
                  milestone.done === 1 ? "text-accent" : "text-warn",
                )}
                title={milestone.done === 1 ? "Mark as not reached" : "Mark as reached"}
                aria-label={milestone.done === 1 ? "Mark milestone as not reached" : "Mark milestone as reached"}
                aria-pressed={milestone.done === 1}
              >
                <IconDiamond className="h-3.5 w-3.5" fill={milestone.done === 1 ? "currentColor" : "none"} />
              </button>
              <span className={cn("min-w-0 flex-1 truncate font-medium", milestone.done === 1 && "text-muted line-through")}>
                {milestone.title}
              </span>
              <span className="text-xs tabular-nums text-muted">{milestone.date ?? ""}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-1.5">
        <input
          className="input input-sm rounded-full"
          placeholder="+ Milestone"
          aria-label="New milestone"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter" && form.title.trim()) {
              run(() => createMilestone(projectId, form.title, form.date || null), () =>
                setForm({ title: "", date: "" }),
              );
            }
          }}
        />
        <input
          type="date"
          className="input input-sm w-36"
          aria-label="Milestone date"
          value={form.date}
          onChange={(e) => setForm({ ...form, date: e.target.value })}
        />
      </div>
    </div>
  );
}

export function StatusSelect({
  kind,
  id,
  value,
  options,
}: {
  kind: "goal" | "strategy" | "project" | "vision";
  id: string;
  value: string;
  options: string[];
}) {
  const { run } = useAction();
  return (
    <select
      className="input input-sm w-auto rounded-full font-semibold capitalize"
      aria-label={`${kind} status`}
      value={value}
      onChange={(e) => {
        const status = e.target.value;
        run(() => {
          if (kind === "goal") return updateGoal(id, { status });
          if (kind === "strategy") return updateStrategy(id, { status });
          if (kind === "project") return updateProject(id, { status });
          return updateVision(id, {});
        });
      }}
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

export function ArchiveButton({
  kind,
  id,
  label = "Archive",
}: {
  kind: "goal" | "strategy" | "project" | "vision";
  id: string;
  label?: string;
}) {
  const { run } = useAction();
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      onClick={() =>
        run(() => {
          if (kind === "goal") return updateGoal(id, { archived: true });
          if (kind === "strategy") return updateStrategy(id, { archived: true });
          if (kind === "project") return updateProject(id, { archived: true });
          return updateVision(id, { archived: true });
        })
      }
    >
      {label}
    </button>
  );
}
