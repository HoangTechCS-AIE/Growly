/** The accent presets Settings offers. Green is the palette's base in
    `globals.css`; the rest restate the four accent roles there under
    `[data-accent="…"]`. Every accent/ink pair clears WCAG AA in both themes,
    which is why this is a fixed list rather than a free colour picker. */
export const ACCENTS = [
  { id: "green", label: "Green", swatch: "#1b7a5a" },
  { id: "blue", label: "Blue", swatch: "#1f6fb2" },
  { id: "violet", label: "Violet", swatch: "#6d4bc4" },
  { id: "amber", label: "Amber", swatch: "#a8630f" },
  { id: "rose", label: "Rose", swatch: "#c0466a" },
  { id: "slate", label: "Slate", swatch: "#3f4a55" },
] as const;

export type AccentId = (typeof ACCENTS)[number]["id"];

/** Anything unrecognised falls back to the base palette. */
export function normalizeAccent(value: string | null | undefined): AccentId {
  return ACCENTS.some((a) => a.id === value) ? (value as AccentId) : "green";
}
