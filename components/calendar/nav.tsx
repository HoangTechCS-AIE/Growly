"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
      <div className="seg" role="group" aria-label="Calendar view">
        {VIEWS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => router.push(`/calendar?view=${key}&date=${date}`)}
            aria-pressed={view === key}
            className={cn("seg-btn capitalize", view === key && "seg-on")}
          >
            {key}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1">
        <button type="button" className="btn btn-outline btn-icon" onClick={() => go(-1)} aria-label="Previous">
          <IconChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="btn btn-outline"
          onClick={() => router.push(`/calendar?view=${view}&date=${todayISO()}`)}
        >
          Today
        </button>
        <button type="button" className="btn btn-outline btn-icon" onClick={() => go(1)} aria-label="Next">
          <IconChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/** A phone opens on the day view: seven columns cannot fit on 390px. */
export function MobileDefaultsToDay() {
  const router = useRouter();
  const params = useSearchParams();
  useEffect(() => {
    if (params.get("view")) return;
    if (!window.matchMedia("(max-width: 767px)").matches) return;
    const next = new URLSearchParams(params.toString());
    next.set("view", "day");
    router.replace(`/calendar?${next.toString()}`);
  }, [params, router]);
  return null;
}
