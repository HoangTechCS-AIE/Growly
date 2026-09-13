import { Wordmark } from "./nav";
import { ThemeToggle } from "./theme-toggle";

/** The thin strip above every page: the wordmark on a phone, and the theme
    toggle. The date belongs to the page that needs it — Today prints it as its
    own eyebrow — so the strip stays out of the way on a desktop. */
export function Topbar() {
  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 bg-canvas/85 px-4 py-2 backdrop-blur sm:px-6 lg:px-8 lg:py-2.5">
      <div className="lg:hidden">
        <Wordmark />
      </div>
      <div className="ml-auto flex items-center gap-1.5">
        <ThemeToggle />
      </div>
    </header>
  );
}
