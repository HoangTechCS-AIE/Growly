import { Suspense } from "react";
import { CalendarNav, MobileDefaultsToDay } from "@/components/calendar/nav";
import { DayWeekGrid } from "@/components/calendar/day-week";
import { MonthGrid } from "@/components/calendar/month";
import { UnscheduledStrip } from "@/components/calendar/rail";
import { PageHeader } from "@/components/ui";
import {
  capacityForRange, getSettings, listMilestones, listTasks,
} from "@/lib/queries";
import {
  formatDate, formatDateLong, monthGrid, monthName, startOfMonthISO, startOfWeekISO,
  todayISO, weekDates,
} from "@/lib/util";

export const dynamic = "force-dynamic";

export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const params = await searchParams;
  const pick = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const today = todayISO();
  const settings = getSettings();
  const view = pick("view") ?? "week";
  const anchor = pick("date") ?? today;

  const dates =
    view === "day"
      ? [anchor]
      : view === "week"
        ? weekDates(startOfWeekISO(anchor, settings.week_starts_on))
        : monthGrid(anchor, settings.week_starts_on);

  const from = dates[0];
  const to = dates[dates.length - 1];

  const scheduled = listTasks({ scheduledFrom: from, scheduledTo: to, includeDone: true }, today);
  const deadlines = listTasks({ includeDone: true }, today).filter(
    (t) => t.due_date && t.due_date >= from && t.due_date <= to,
  );
  const milestones = listMilestones({ from, to });
  const unscheduled = listTasks(
    { unscheduled: true, parentId: null, order: "t.important DESC, t.urgent DESC, t.created_at DESC" },
    today,
  );
  // Scheduled for a day but with no hour committed yet. These used to sit in a
  // tile below the grid, where a full-height week grid hid them entirely.
  const untimed = scheduled.filter((t) => t.start_min == null && t.status !== "done");
  const plannedByDay = Object.fromEntries(
    capacityForRange(from, to).map((row) => [row.date, row.planned]),
  );

  const title =
    view === "month"
      ? `${monthName(anchor)} ${anchor.slice(0, 4)}`
      : view === "day"
        ? formatDateLong(anchor)
        : `${formatDate(from)} — ${formatDate(to)}`;

  return (
    <div className="mx-auto max-w-[1700px]">
      <Suspense fallback={null}>
        <MobileDefaultsToDay />
      </Suspense>
      <PageHeader
        eyebrow="Calendar"
        title={title}
        actions={<CalendarNav view={view} date={anchor} />}
      />

      <div className="flex flex-col gap-4">
        {unscheduled.length > 0 && <UnscheduledStrip tasks={unscheduled} />}

        {view === "month" ? (
          <MonthGrid
            cells={dates}
            anchor={startOfMonthISO(anchor)}
            tasks={scheduled}
            deadlines={deadlines}
            milestones={milestones}
            plannedByDay={plannedByDay}
            capacity={settings.daily_capacity_min}
            today={today}
            weekStartsOn={settings.week_starts_on}
          />
        ) : (
          <DayWeekGrid
            dates={dates}
            tasks={scheduled}
            untimed={untimed}
            deadlines={deadlines}
            milestones={milestones}
            dayStart={settings.day_start_min}
            dayEnd={settings.day_end_min}
            capacity={settings.daily_capacity_min}
            plannedByDay={plannedByDay}
            today={today}
          />
        )}
      </div>
    </div>
  );
}
