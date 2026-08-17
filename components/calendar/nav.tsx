"use client";

import { useRouter } from "next/navigation";
import { addDaysISO, addMonthsISO, cn, todayISO } from "@/lib/util";
import { IconChevronLeft, IconChevronRight } from "../icons";

const VIEWS = ["day", "week", "month"] as const;

export function CalendarNav({ view, date }: { view: string; date: string }) {
  const router = useRouter();
  const step = view === "month" ? 0 : view === "week" ? 7 : 1;

  function go(delta: number) {
    const next = view === "month" ? addMonthsISO(date, delta) : addDaysISO(date, delta * step);
    router.push(`/calendar?view=${view}&date=${next}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex rounded-lg border border-line bg-surface p-0.5">
        {VIEWS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => router.push(`/calendar?view=${key}&date=${date}`)}
            aria-pressed={view === key}
            className={cn(
              "rounded-[7px] px-2.5 py-1.5 text-[12.5px] font-medium capitalize transition cursor-pointer",
              view === key ? "bg-surface-3 text-ink" : "text-muted hover:text-ink",
            )}
          >
            {key}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1">
        <button type="button" className="btn btn-sm" onClick={() => go(-1)} aria-label="Previous">
          <IconChevronLeft className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => router.push(`/calendar?view=${view}&date=${todayISO()}`)}
        >
          Today
        </button>
        <button type="button" className="btn btn-sm" onClick={() => go(1)} aria-label="Next">
          <IconChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
