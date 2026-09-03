"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/util";
import { IconMonitor, IconMoon, IconSun } from "./icons";

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

  const Icon = !mounted ? IconMonitor : theme === "light" ? IconSun : theme === "dark" ? IconMoon : IconMonitor;

  return (
    <button
      type="button"
      onClick={cycle}
      className={cn("btn btn-outline btn-icon", className)}
      title={LABEL[theme]}
      aria-label={`${LABEL[theme]}. Activate to change the theme.`}
    >
      <Icon className="h-[18px] w-[18px]" />
    </button>
  );
}

/** Runs before paint so a stored theme never flashes the wrong palette. */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${STORAGE_KEY}");if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t)}}catch(e){}})()`;
