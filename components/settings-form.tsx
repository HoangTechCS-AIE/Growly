"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createArea, deleteArea, updateSettings } from "@/lib/actions";
import type { Area, Settings } from "@/lib/types";
import { cn, COLORS, dotTone, formatClock, formatDuration } from "@/lib/util";
import { Tile } from "./ui";
import { IconPlus, IconX } from "./icons";

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
      <Tile title="Day and capacity" hint="Used by the calendar grid and the over-capacity warning">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
          <div>
            <label className="label" htmlFor="day-start">Day starts</label>
            <input
              id="day-start"
              type="time"
              className="input"
              value={form.day_start_min}
              onChange={(e) => setForm({ ...form, day_start_min: e.target.value })}
            />
          </div>
          <div>
            <label className="label" htmlFor="day-end">Day ends</label>
            <input
              id="day-end"
              type="time"
              className="input"
              value={form.day_end_min}
              onChange={(e) => setForm({ ...form, day_end_min: e.target.value })}
            />
          </div>
          <div>
            <label className="label" htmlFor="capacity">Focus per day (minutes)</label>
            <input
              id="capacity"
              type="number"
              className="input"
              value={form.daily_capacity_min}
              onChange={(e) => setForm({ ...form, daily_capacity_min: e.target.value })}
            />
            <p className="mt-1.5 text-xs text-muted">
              {formatDuration(Number(form.daily_capacity_min) || 0)} — planning beyond this raises a warning.
            </p>
          </div>
          <div>
            <label className="label" htmlFor="week-start">Week starts on</label>
            <select
              id="week-start"
              className="input"
              value={form.week_starts_on}
              onChange={(e) => setForm({ ...form, week_starts_on: e.target.value })}
            >
              <option value="1">Monday</option>
              <option value="0">Sunday</option>
            </select>
          </div>
        </div>
        <div className="flex items-center gap-3">
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
          {saved && <span className="tag tag-accent">Saved</span>}
        </div>
      </Tile>

      <Tile title="Life areas" hint="Work, Health, Learning — the buckets a goal or task belongs to">
        <ul className="flex flex-wrap gap-2">
          {areas.map((item) => (
            <li key={item.id} className="flex h-10 items-center gap-2 rounded-full bg-surface-3 pr-1.5 pl-3.5 text-sm font-semibold">
              <span className={cn("h-2.5 w-2.5 rounded-full", dotTone(item.color))} />
              <span>{item.name}</span>
              <button
                type="button"
                className="btn btn-ghost btn-icon btn-sm hover:text-danger"
                title="Delete area"
                aria-label={`Delete area ${item.name}`}
                onClick={() =>
                  startTransition(async () => {
                    await deleteArea(item.id);
                    router.refresh();
                  })
                }
              >
                <IconX className="h-4 w-4" />
              </button>
            </li>
          ))}
          {!areas.length && <li className="text-sm text-muted">No areas yet.</li>}
        </ul>
        <div className="flex flex-wrap gap-2">
          <input
            className="input w-48"
            placeholder="New area"
            aria-label="New area name"
            value={area.name}
            onChange={(e) => setArea({ ...area, name: e.target.value })}
          />
          <select
            className="input w-auto capitalize"
            aria-label="Area colour"
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
            className="btn btn-outline"
            disabled={!area.name.trim()}
            onClick={() =>
              startTransition(async () => {
                await createArea(area.name, area.color);
                setArea({ name: "", color: "indigo" });
                router.refresh();
              })
            }
          >
            <IconPlus className="h-4 w-4" />
            Add area
          </button>
        </div>
      </Tile>
    </div>
  );
}
