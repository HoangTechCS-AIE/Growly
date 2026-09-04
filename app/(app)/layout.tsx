import { BottomNav, Rail } from "@/components/nav";
import { Topbar } from "@/components/topbar";
import { requireUser } from "@/lib/auth";
import { listTasks } from "@/lib/queries";
import { todayISO } from "@/lib/util";

export const dynamic = "force-dynamic";

/** The signed-in shell. Everything under it needs an account; /login and
    /setup sit outside this group and keep the bare page. */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  await requireUser();

  const today = todayISO();
  const counts = {
    inbox: listTasks({ status: ["inbox"], parentId: null }, today).length,
    today: listTasks({ scheduledOn: today, parentId: null }, today).length,
    overdue: listTasks({ dueBefore: today, parentId: null }, today).length,
  };

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-full focus:border focus:border-line focus:bg-surface focus:px-4 focus:py-2 focus:text-sm"
      >
        Skip to content
      </a>
      <div className="flex min-h-screen">
        <Rail counts={counts} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main
            id="main"
            className="min-w-0 flex-1 px-4 pt-2 pb-[calc(84px+env(safe-area-inset-bottom))] sm:px-6 lg:px-8 lg:pt-3 lg:pb-8"
          >
            {children}
          </main>
        </div>
      </div>
      <BottomNav counts={counts} />
    </>
  );
}
