"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createArea, deleteArea, updateSettings } from "@/lib/actions";
import type { Area, Settings } from "@/lib/types";
import { cn, COLORS, dotTone, formatClock, formatDuration } from "@/lib/util";
import { Card } from "./ui";
import { IconTrash } from "./icons";

export function SettingsForm({ settings, areas }: { settings: Settings; areas: Area[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({
    day_start_min: formatClock(settings.day_start_min),
    day_end_min: formatClock(settings.day_end_min),
    daily_capacity_min: String(settings.daily_capacity_min),
    week_starts_on: String(settings.week_starts_on),
  });
  const [area, setArea] = useState({ name: "", color: "indigo" });

  const toMinutes = (value: string) =>
    Number(value.split(":")[0]) * 60 + Number(value.split(":")[1] ?? 0);

  return (
    <div className="flex flex-col gap-4">
      <Card title="Day and capacity" hint="Used by the calendar grid and the over-capacity warning">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div>
            <label className="label">Day starts</label>
            <input
              type="time"
              className="input"
              value={form.day_start_min}
              onChange={(e) => setForm({ ...form, day_start_min: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Day ends</label>
            <input
              type="time"
              className="input"
              value={form.day_end_min}
              onChange={(e) => setForm({ ...form, day_end_min: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Realistic focus per day (minutes)</label>
            <input
              type="number"
              className="input"
              value={form.daily_capacity_min}
              onChange={(e) => setForm({ ...form, daily_capacity_min: e.target.value })}
            />
            <p className="mt-1 text-[11px] text-muted">
              {formatDuration(Number(form.daily_capacity_min) || 0)} — planning beyond this raises a
              warning.
            </p>
          </div>
          <div>
            <label className="label">Week starts on</label>
            <select
              className="input"
              value={form.week_starts_on}
              onChange={(e) => setForm({ ...form, week_starts_on: e.target.value })}
            >
              <option value="1">Monday</option>
              <option value="0">Sunday</option>
            </select>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            className="btn btn-primary"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await updateSettings({
                  day_start_min: String(toMinutes(form.day_start_min)),
                  day_end_min: String(toMinutes(form.day_end_min)),
                  daily_capacity_min: form.daily_capacity_min,
                  week_starts_on: form.week_starts_on,
                });
                setSaved(true);
                router.refresh();
              })
            }
          >
            Save settings
          </button>
          {saved && <span className="text-[12px] text-accent">Saved</span>}
        </div>
      </Card>

      <Card title="Life areas" hint="Work, Health, Learning — the buckets a goal or task belongs to">
        <ul className="mb-3 flex flex-wrap gap-2">
          {areas.map((item) => (
            <li key={item.id} className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-2.5 py-1.5">
              <span className={cn("h-2 w-2 rounded-full", dotTone(item.color))} />
              <span className="text-[13px]">{item.name}</span>
              <button
                type="button"
                className="text-muted transition hover:text-danger cursor-pointer"
                title="Delete area"
                onClick={() =>
                  startTransition(async () => {
                    await deleteArea(item.id);
                    router.refresh();
                  })
                }
              >
                <IconTrash className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <input
            className="input w-48"
            placeholder="New area"
            value={area.name}
            onChange={(e) => setArea({ ...area, name: e.target.value })}
          />
          <select
            className="input w-auto"
            value={area.color}
            onChange={(e) => setArea({ ...area, color: e.target.value })}
          >
            {COLORS.map((color) => (
              <option key={color} value={color}>
                {color}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn"
            disabled={!area.name.trim()}
            onClick={() =>
              startTransition(async () => {
                await createArea(area.name, area.color);
                setArea({ name: "", color: "indigo" });
                router.refresh();
              })
            }
          >
            Add area
          </button>
        </div>
      </Card>
    </div>
  );
}
