import type { Metadata, Viewport } from "next";
import { Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { THEME_SCRIPT } from "@/components/theme-toggle";
import { getSettings } from "@/lib/queries";

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
  const { accent } = getSettings();

  return (
    <html
      lang="en"
      // Chosen in Settings and rendered here, so the accent is right on the
      // first paint the way the theme is.
      data-accent={accent}
      className={`${jakarta.variable} ${geistMono.variable} h-full`}
      // The pre-paint script stamps data-theme before React hydrates.
      suppressHydrationWarning
    >
      <body className="min-h-full">
        {/* Applies a stored theme before the first paint. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {children}
      </body>
    </html>
  );
}
