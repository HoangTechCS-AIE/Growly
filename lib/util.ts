/** Local-date helpers. Every date in Growly is a local "YYYY-MM-DD" string. */

export function newId(): string {
  return crypto.randomUUID();
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function fromISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function addDaysISO(iso: string, days: number): string {
  const d = fromISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function addMonthsISO(iso: string, months: number): string {
  const d = fromISODate(iso);
  d.setMonth(d.getMonth() + months, 1);
  return toISODate(d);
}

export function startOfWeekISO(iso: string, weekStartsOn = 1): string {
  const d = fromISODate(iso);
  const diff = (d.getDay() - weekStartsOn + 7) % 7;
  d.setDate(d.getDate() - diff);
  return toISODate(d);
}

export function startOfMonthISO(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function endOfMonthISO(iso: string): string {
  const d = fromISODate(iso);
  d.setMonth(d.getMonth() + 1, 0);
  return toISODate(d);
}

export function weekDates(startISO: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysISO(startISO, i));
}

export function monthGrid(anchorISO: string, weekStartsOn = 1): string[] {
  const first = startOfWeekISO(startOfMonthISO(anchorISO), weekStartsOn);
  const lastOfMonth = endOfMonthISO(anchorISO);
  const cells: string[] = [];
  let cursor = first;
  while (cells.length < 42) {
    cells.push(cursor);
    if (cells.length >= 28 && cursor >= lastOfMonth && cells.length % 7 === 0) break;
    cursor = addDaysISO(cursor, 1);
  }
  return cells;
}

/** ISO-8601 week key, e.g. "2026-W34". */
export function weekKey(iso: string): string {
  const d = fromISODate(iso);
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  target.setDate(target.getDate() + 3 - ((target.getDay() + 6) % 7));
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  firstThursday.setDate(firstThursday.getDate() + 3 - ((firstThursday.getDay() + 6) % 7));
  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 86400000));
  return `${target.getFullYear()}-W${`${week}`.padStart(2, "0")}`;
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function dayName(iso: string): string {
  return DAY_NAMES[fromISODate(iso).getDay()];
}

export function monthName(iso: string): string {
  return MONTH_NAMES[fromISODate(iso).getMonth()];
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = fromISODate(iso);
  return `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()].slice(0, 3)}`;
}

export function formatDateLong(iso: string): string {
  const d = fromISODate(iso);
  return `${DAY_NAMES[d.getDay()]}, ${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

export function relativeDay(iso: string | null | undefined, today = todayISO()): string {
  if (!iso) return "";
  if (iso === today) return "Today";
  if (iso === addDaysISO(today, 1)) return "Tomorrow";
  if (iso === addDaysISO(today, -1)) return "Yesterday";
  return formatDate(iso);
}

/** Minutes past midnight -> "08:30". */
export function formatClock(min: number | null | undefined): string {
  if (min == null) return "";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${`${h}`.padStart(2, "0")}:${`${m}`.padStart(2, "0")}`;
}

export function formatDuration(min: number | null | undefined): string {
  if (!min) return "";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

export function parseDuration(input: string): number | null {
  const text = input.trim().toLowerCase();
  if (!text) return null;
  const hm = text.match(/^(\d+(?:[.,]\d+)?)\s*h(?:\s*(\d+)\s*m?)?$/);
  if (hm) return Math.round(parseFloat(hm[1].replace(",", ".")) * 60) + Number(hm[2] ?? 0);
  const m = text.match(/^(\d+)\s*m(?:in)?$/);
  if (m) return Number(m[1]);
  const plain = text.match(/^\d+$/);
  if (plain) return Number(text);
  return null;
}

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export const COLORS = [
  "indigo", "emerald", "amber", "rose", "sky", "violet", "teal", "orange", "slate",
] as const;

export type ColorName = (typeof COLORS)[number];

/** Tone classes resolve their colours from CSS variables, so chips, dots and
    calendar blocks stay legible in both themes from a single definition. */
const TONE: Record<string, string> = {
  indigo: "tone-indigo",
  emerald: "tone-emerald",
  amber: "tone-amber",
  rose: "tone-rose",
  sky: "tone-sky",
  violet: "tone-violet",
  teal: "tone-teal",
  orange: "tone-orange",
  slate: "tone-slate",
};

const tone = (color: string | null | undefined) => TONE[color ?? "slate"] ?? TONE.slate;

export const chipTone = (color?: string | null) => `chip tone-chip ${tone(color)}`;
export const dotTone = (color?: string | null) => `tone-dot ${tone(color)}`;
export const blockTone = (color?: string | null) => `tone-block ${tone(color)}`;

export function pct(part: number, total: number): number {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}
