import { Wordmark } from "./nav";
import { ThemeToggle } from "./theme-toggle";
import { formatDateLong, todayISO } from "@/lib/util";

/** The thin strip above every page: the wordmark on a phone, today's date on a
    desktop, and the theme toggle. A server component so the date is rendered
    once rather than computed again at hydration. */
export function Topbar() {
  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 bg-canvas/85 px-4 py-2 backdrop-blur sm:px-6 lg:px-8 lg:py-2.5">
      <div className="lg:hidden">
        <Wordmark />
      </div>
      <span className="hidden text-sm font-semibold text-muted lg:inline">
        {formatDateLong(todayISO())}
      </span>
      <div className="ml-auto flex items-center gap-1.5">
        <ThemeToggle />
      </div>
    </header>
  );
}
