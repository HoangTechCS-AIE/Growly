import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { CommandPalette } from "@/components/command-palette";
import { MobileNav, Sidebar } from "@/components/nav";
import { Topbar } from "@/components/topbar";
import { THEME_SCRIPT } from "@/components/theme-toggle";
import { listAreas, listProjects, listTasks } from "@/lib/queries";
import { todayISO } from "@/lib/util";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Growly",
  description: "Turn long-term strategy into daily action.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0b0e" },
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
      className={`${geistSans.variable} ${geistMono.variable} h-full`}
      // The pre-paint script stamps data-theme before React hydrates.
      suppressHydrationWarning
    >
      <body className="min-h-full">
        {/* Applies a stored theme before the first paint. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-lg focus:border focus:border-line focus:bg-surface focus:px-3 focus:py-2 focus:text-[13px]"
        >
          Skip to content
        </a>
        <div className="flex min-h-screen">
          <Sidebar counts={counts} />
          <div className="flex min-w-0 flex-1 flex-col">
            <Topbar
              areas={areas}
              projects={projects}
              nav={<MobileNav key="mobile-nav" counts={counts} />}
            />
            <main id="main" className="min-w-0 flex-1 px-3 py-4 sm:px-5 lg:px-6 lg:py-5">
              {children}
            </main>
          </div>
        </div>
        <CommandPalette />
      </body>
    </html>
  );
}
