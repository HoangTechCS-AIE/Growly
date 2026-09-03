import type { Metadata, Viewport } from "next";
import { Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { CommandPalette } from "@/components/command-palette";
import { BottomNav, Rail } from "@/components/nav";
import { Topbar } from "@/components/topbar";
import { THEME_SCRIPT } from "@/components/theme-toggle";
import { listAreas, listProjects, listTasks } from "@/lib/queries";
import { todayISO } from "@/lib/util";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin", "latin-ext", "vietnamese"],
  weight: ["400", "500", "600", "700", "800"],
});
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Growly",
  description: "Turn long-term strategy into daily action.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f1f0ec" },
    { media: "(prefers-color-scheme: dark)", color: "#141513" },
  ],
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: LayoutProps<"/">) {
  const today = todayISO();
  const counts = {
    inbox: listTasks({ status: ["inbox"], parentId: null }, today).length,
    today: listTasks({ scheduledOn: today, parentId: null }, today).length,
    overdue: listTasks({ dueBefore: today, parentId: null }, today).length,
  };
  const areas = listAreas();
  const projects = listProjects({ status: "active" });

  return (
    <html
      lang="en"
      className={`${jakarta.variable} ${geistMono.variable} h-full`}
      // The pre-paint script stamps data-theme before React hydrates.
      suppressHydrationWarning
    >
      <body className="min-h-full">
        {/* Applies a stored theme before the first paint. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-full focus:border focus:border-line focus:bg-surface focus:px-4 focus:py-2 focus:text-sm"
        >
          Skip to content
        </a>
        <div className="flex min-h-screen">
          <Rail counts={counts} />
          <div className="flex min-w-0 flex-1 flex-col">
            <Topbar areas={areas} projects={projects} />
            <main
              id="main"
              className="min-w-0 flex-1 px-4 pt-2 pb-[calc(84px+env(safe-area-inset-bottom))] sm:px-6 lg:px-8 lg:pt-3 lg:pb-8"
            >
              {children}
            </main>
          </div>
        </div>
        <BottomNav counts={counts} />
        <CommandPalette />
      </body>
    </html>
  );
}
