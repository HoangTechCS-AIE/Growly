"use server";

import { createTask } from "./actions";
import { listAreas, listGoals, listProjects } from "./queries";
import { addDaysISO, parseDuration, todayISO } from "./util";

const DAY_WORDS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function resolveDate(word: string, today: string): string | null {
  const w = word.toLowerCase();
  if (w === "today" || w === "tod") return today;
  if (w === "tomorrow" || w === "tmr" || w === "tom") return addDaysISO(today, 1);
  if (w === "yesterday") return addDaysISO(today, -1);
  if (/^\d{4}-\d{2}-\d{2}$/.test(w)) return w;

  const dm = w.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (dm) {
    const year = dm[3] ? Number(dm[3].length === 2 ? `20${dm[3]}` : dm[3]) : Number(today.slice(0, 4));
    return `${year}-${dm[2].padStart(2, "0")}-${dm[1].padStart(2, "0")}`;
  }

  const dayIndex = DAY_WORDS.indexOf(w.slice(0, 3));
  if (dayIndex >= 0) {
    const current = new Date(`${today}T00:00:00`).getDay();
    const delta = (dayIndex - current + 7) % 7 || 7;
    return addDaysISO(today, delta);
  }
  return null;
}

function takeMatches(text: string, pattern: RegExp): { text: string; values: string[] } {
  const values: string[] = [];
  const next = text.replace(pattern, (...args) => {
    const groups = args.slice(1, -2) as (string | undefined)[];
    // args[0] is the full match, group 1 is the leading separator; the first
    // non-empty group after it is the captured value.
    const value = groups.slice(1).find((g) => g != null && g !== "");
    if (value) values.push(value);
    return " ";
  });
  return { text: next, values };
}

/**
 * Quick-add syntax:
 *   @project  ~goal  /area  #tag  !urgent  *important
 *   today | tmr | mon..sun | 2026-08-20 | 20/8      -> scheduled day
 *   due:tomorrow                                     -> deadline
 *   14:00                                            -> start of the time block
 *   45m | 1h30                                       -> estimate
 *   every day | every weekday | every week | every month
 */
export async function quickAdd(text: string, defaults: { scheduled_date?: string } = {}) {
  const today = todayISO();
  let rest = ` ${text.trim()} `;
  if (!rest.trim()) return null;

  const projects = listProjects();
  const goals = listGoals();
  const areas = listAreas();

  const project = takeMatches(rest, /(^|\s)@(?:"([^"]+)"|(\S+))/g);
  rest = project.text;
  const goal = takeMatches(rest, /(^|\s)~(?:"([^"]+)"|(\S+))/g);
  rest = goal.text;
  const area = takeMatches(rest, /(^|\s)\/(?:"([^"]+)"|(\S+))/g);
  rest = area.text;
  const tags = takeMatches(rest, /(^|\s)#(?:"([^"]+)"|(\S+))/g);
  rest = tags.text;
  const due = takeMatches(rest, /(^|\s)due:(?:"([^"]+)"|(\S+))/gi);
  rest = due.text;
  const every = takeMatches(rest, /(^|\s)every\s+(day|weekday|weekdays|week|2weeks|month)(?=\s)/gi);
  rest = every.text;
  const clock = takeMatches(rest, /(^|\s)()(\d{1,2}:\d{2})(?=\s)/g);
  rest = clock.text;
  const estimate = takeMatches(rest, /(^|\s)()(\d+(?:[.,]\d+)?h(?:\s?\d+m?)?|\d+m(?:in)?)(?=\s)/gi);
  rest = estimate.text;

  let urgent = false;
  let important = false;
  rest = rest.replace(/(^|\s)!(?=\s)/g, () => ((urgent = true), " "));
  rest = rest.replace(/(^|\s)\*(?=\s)/g, () => ((important = true), " "));

  // Scheduled day: the first bare word that reads as a date.
  let scheduled: string | null = defaults.scheduled_date ?? null;
  const words = rest.split(/\s+/).filter(Boolean);
  const kept: string[] = [];
  for (const word of words) {
    const asDate = scheduled === (defaults.scheduled_date ?? null) ? resolveDate(word, today) : null;
    if (asDate && !kept.includes(word)) scheduled = asDate;
    else kept.push(word);
  }

  const findByName = <T extends { title?: string; name?: string; id: string }>(
    list: T[],
    needle: string | undefined,
  ) => {
    if (!needle) return null;
    const n = needle.toLowerCase();
    return (
      list.find((item) => (item.title ?? item.name ?? "").toLowerCase() === n) ??
      list.find((item) => (item.title ?? item.name ?? "").toLowerCase().startsWith(n)) ??
      list.find((item) => (item.title ?? item.name ?? "").toLowerCase().includes(n)) ??
      null
    );
  };

  const matchedProject = findByName(projects, project.values[0]);
  const matchedGoal = findByName(goals, goal.values[0]);
  const matchedArea = findByName(areas, area.values[0]);

  // Unmatched references stay in the title so nothing is silently lost.
  const leftovers = [
    !matchedProject && project.values[0] ? `@${project.values[0]}` : "",
    !matchedGoal && goal.values[0] ? `~${goal.values[0]}` : "",
    !matchedArea && area.values[0] ? `/${area.values[0]}` : "",
  ].filter(Boolean);

  const title = [...kept, ...leftovers].join(" ").trim();
  if (!title) return null;

  const startMin = clock.values[0]
    ? Number(clock.values[0].split(":")[0]) * 60 + Number(clock.values[0].split(":")[1])
    : null;
  const estimateMin = estimate.values[0] ? parseDuration(estimate.values[0].replace(/\s/g, "")) : null;
  const recurrence = every.values[0]
    ? { day: "daily", weekday: "weekdays", weekdays: "weekdays", week: "weekly", "2weeks": "biweekly", month: "monthly" }[
        every.values[0].toLowerCase()
      ] ?? null
    : null;

  return createTask({
    title,
    project_id: matchedProject?.id ?? null,
    goal_id: matchedGoal?.id ?? null,
    area_id: matchedArea?.id ?? null,
    tags: tags.values,
    important,
    urgent,
    due_date: due.values[0] ? resolveDate(due.values[0], today) : null,
    scheduled_date: scheduled,
    start_min: startMin,
    end_min: startMin != null ? Math.min(startMin + (estimateMin ?? 60), 1440) : null,
    estimate_minutes: estimateMin,
    recurrence,
    status: scheduled ? "planned" : "inbox",
  });
}
