import { Suspense } from "react";
import { CalendarNav, MobileDefaultsToDay } from "@/components/calendar/nav";
import { DayWeekGrid } from "@/components/calendar/day-week";
import { MonthGrid } from "@/components/calendar/month";
import { DraggableChip } from "@/components/calendar/chip";
import { UnscheduledRail } from "@/components/calendar/rail";
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
    <div className="mx-auto max-w-[1500px]">
      <Suspense fallback={null}>
        <MobileDefaultsToDay />
      </Suspense>
      <PageHeader
        eyebrow="Calendar"
        title={title}
        actions={<CalendarNav view={view} date={anchor} />}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-4">
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
              deadlines={deadlines}
              milestones={milestones}
              dayStart={settings.day_start_min}
              dayEnd={settings.day_end_min}
              capacity={settings.daily_capacity_min}
              plannedByDay={plannedByDay}
              today={today}
            />
          )}

          {view !== "month" && <UnscheduledDayList dates={dates} tasks={scheduled} />}
        </div>

        <UnscheduledRail tasks={unscheduled} />
      </div>
    </div>
  );
}

/** Tasks assigned to a day but without a time block yet. */
function UnscheduledDayList({
  dates,
  tasks,
}: {
  dates: string[];
  tasks: Awaited<ReturnType<typeof listTasks>>;
}) {
  const untimed = tasks.filter((t) => t.start_min == null && t.status !== "done");
  if (!untimed.length) return null;

  return (
    <div className="tile">
      <p className="tile-title">All-day · no time block yet</p>
      <div className="flex gap-2 overflow-x-auto">
        {dates.map((date) => {
          const items = untimed.filter((t) => t.scheduled_date === date);
          if (dates.length > 1 && !items.length) return <div key={date} className="min-w-0 flex-1" />;
          return (
            <div key={date} className="flex min-w-0 flex-1 flex-col gap-1.5">
              {dates.length > 1 && <span className="text-[11px] font-bold text-muted">{formatDate(date)}</span>}
              {items.map((task) => (
                <DraggableChip key={task.id} task={task} />
              ))}
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted">Drag these into the grid above to give them a time block.</p>
    </div>
  );
}
