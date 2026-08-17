"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/util";

type Theme = "system" | "light" | "dark";

const STORAGE_KEY = "growly-theme";
const ORDER: Theme[] = ["system", "light", "dark"];

const LABEL: Record<Theme, string> = {
  system: "Match the system theme",
  light: "Light theme",
  dark: "Dark theme",
};

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (stored && ORDER.includes(stored)) setTheme(stored);
    setMounted(true);
  }, []);

  function cycle() {
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    setTheme(next);
    localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
  }

  return (
    <button
      type="button"
      onClick={cycle}
      className={cn("btn btn-sm btn-ghost", className)}
      title={LABEL[theme]}
      aria-label={`${LABEL[theme]}. Activate to change the theme.`}
    >
      <span aria-hidden="true" className="text-[13px] leading-none">
        {!mounted ? "◐" : theme === "light" ? "☀" : theme === "dark" ? "☾" : "◐"}
      </span>
      <span className="sr-only">Theme</span>
    </button>
  );
}

/** Runs before paint so a stored theme never flashes the wrong palette. */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${STORAGE_KEY}");if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t)}}catch(e){}})()`;
