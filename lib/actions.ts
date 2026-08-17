"use server";

import { revalidatePath } from "next/cache";
import { all, get, run, tx } from "./db";
import type { Note, Task, TaskStatus } from "./types";
import { addDaysISO, newId, nowISO, todayISO } from "./util";

function touch() {
  revalidatePath("/", "layout");
}

function logEvent(taskId: string, kind: string, detail?: string) {
  run(
    "INSERT INTO task_events(id, task_id, kind, detail, created_at) VALUES(?, ?, ?, ?, ?)",
    newId(),
    taskId,
    kind,
    detail ?? null,
    nowISO(),
  );
}

function ensureTag(name: string): string {
  const clean = name.trim().replace(/^#/, "");
  if (!clean) return "";
  const existing = get<{ id: string }>("SELECT id FROM tags WHERE name = ? COLLATE NOCASE", clean);
  if (existing) return existing.id;
  const id = newId();
  run(
    "INSERT INTO tags(id, name, color, created_at) VALUES(?, ?, ?, ?)",
    id,
    clean,
    "slate",
    nowISO(),
  );
  return id;
}

function nextOccurrence(from: string, rule: string): string {
  switch (rule) {
    case "daily":
      return addDaysISO(from, 1);
    case "weekdays": {
      let next = addDaysISO(from, 1);
      while ([0, 6].includes(new Date(`${next}T00:00:00`).getDay())) next = addDaysISO(next, 1);
      return next;
    }
    case "weekly":
      return addDaysISO(from, 7);
    case "biweekly":
      return addDaysISO(from, 14);
    case "monthly": {
      const [y, m, d] = from.split("-").map(Number);
      const date = new Date(y, m - 1 + 1, d);
      return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}-${`${date.getDate()}`.padStart(2, "0")}`;
    }
    default:
      return addDaysISO(from, 1);
  }
}

/* --------------------------------------------------------------------- tasks */

export interface TaskInput {
  title: string;
  notes?: string | null;
  short_term_outcome?: string | null;
  long_term_contribution?: string | null;
  next_action?: string | null;
  goal_id?: string | null;
  project_id?: string | null;
  area_id?: string | null;
  parent_id?: string | null;
  status?: TaskStatus;
  important?: boolean;
  urgent?: boolean;
  estimate_minutes?: number | null;
  due_date?: string | null;
  scheduled_date?: string | null;
  start_min?: number | null;
  end_min?: number | null;
  waiting_on?: string | null;
  recurrence?: string | null;
  tags?: string[];
}

export async function createTask(input: TaskInput): Promise<string> {
  const id = newId();
  const now = nowISO();
  tx(() => {
    run(
      `INSERT INTO tasks(id, title, notes, short_term_outcome, long_term_contribution, next_action,
         goal_id, project_id, area_id, parent_id, status, important, urgent, estimate_minutes,
         due_date, scheduled_date, start_min, end_min, waiting_on, recurrence, series_id,
         created_at, updated_at)
       VALUES($id, $title, $notes, $sto, $ltc, $next, $goal, $project, $area, $parent, $status,
         $important, $urgent, $estimate, $due, $sched, $start, $end, $waiting, $rec, $series,
         $now, $now)`,
      {
        id,
        title: input.title.trim(),
        notes: input.notes ?? null,
        sto: input.short_term_outcome ?? null,
        ltc: input.long_term_contribution ?? null,
        next: input.next_action ?? null,
        goal: input.goal_id || null,
        project: input.project_id || null,
        area: input.area_id || null,
        parent: input.parent_id || null,
        status: input.status ?? (input.scheduled_date ? "planned" : "inbox"),
        important: input.important ? 1 : 0,
        urgent: input.urgent ? 1 : 0,
        estimate: input.estimate_minutes ?? null,
        due: input.due_date || null,
        sched: input.scheduled_date || null,
        start: input.start_min ?? null,
        end: input.end_min ?? null,
        waiting: input.waiting_on ?? null,
        rec: input.recurrence || null,
        series: input.recurrence ? id : null,
        now,
      },
    );
    for (const tag of input.tags ?? []) {
      const tagId = ensureTag(tag);
      if (tagId) run("INSERT OR IGNORE INTO task_tags(task_id, tag_id) VALUES(?, ?)", id, tagId);
    }
    logEvent(id, "created");
  });
  touch();
  return id;
}

export async function updateTask(id: string, patch: Partial<TaskInput>): Promise<void> {
  const before = get<Task>("SELECT * FROM tasks WHERE id = ?", id);
  if (!before) return;

  const fields: Record<string, unknown> = {};
  const map: Record<string, string> = {
    title: "title",
    notes: "notes",
    short_term_outcome: "short_term_outcome",
    long_term_contribution: "long_term_contribution",
    next_action: "next_action",
    goal_id: "goal_id",
    project_id: "project_id",
    area_id: "area_id",
    parent_id: "parent_id",
    status: "status",
    estimate_minutes: "estimate_minutes",
    due_date: "due_date",
    scheduled_date: "scheduled_date",
    start_min: "start_min",
    end_min: "end_min",
    waiting_on: "waiting_on",
    recurrence: "recurrence",
  };
  for (const [key, column] of Object.entries(map)) {
    if (key in patch) {
      const value = (patch as Record<string, unknown>)[key];
      fields[column] = value === "" ? null : value;
    }
  }
  if ("important" in patch) fields.important = patch.important ? 1 : 0;
  if ("urgent" in patch) fields.urgent = patch.urgent ? 1 : 0;

  tx(() => {
    if (Object.keys(fields).length) {
      const sets = Object.keys(fields).map((c) => `${c} = $${c}`);
      run(`UPDATE tasks SET ${sets.join(", ")}, updated_at = $updated_at WHERE id = $id`, {
        ...fields,
        updated_at: nowISO(),
        id,
      });
    }
    if (patch.tags) {
      run("DELETE FROM task_tags WHERE task_id = ?", id);
      for (const tag of patch.tags) {
        const tagId = ensureTag(tag);
        if (tagId) run("INSERT OR IGNORE INTO task_tags(task_id, tag_id) VALUES(?, ?)", id, tagId);
      }
    }
    if (patch.status && patch.status !== before.status) {
      logEvent(id, "status", `${before.status} -> ${patch.status}`);
    }
    if ("scheduled_date" in patch && patch.scheduled_date !== before.scheduled_date) {
      logEvent(id, "scheduled", patch.scheduled_date ?? "cleared");
    }
  });
  touch();
}

export async function setTaskStatus(id: string, status: TaskStatus): Promise<void> {
  const task = get<Task>("SELECT * FROM tasks WHERE id = ?", id);
  if (!task) return;
  const now = nowISO();

  tx(() => {
    run(
      "UPDATE tasks SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?",
      status,
      status === "done" ? now : null,
      now,
      id,
    );
    logEvent(id, "status", `${task.status} -> ${status}`);

    if (status === "done" && task.recurrence) {
      const anchor = task.scheduled_date ?? task.due_date ?? todayISO();
      const nextDate = nextOccurrence(anchor, task.recurrence);
      if (!task.recurrence_until || nextDate <= task.recurrence_until) {
        const nextId = newId();
        run(
          `INSERT INTO tasks(id, title, notes, short_term_outcome, long_term_contribution,
             next_action, goal_id, project_id, area_id, parent_id, status, important, urgent,
             estimate_minutes, due_date, scheduled_date, start_min, end_min, waiting_on,
             recurrence, recurrence_until, series_id, created_at, updated_at)
           SELECT $newId, title, notes, short_term_outcome, long_term_contribution, next_action,
             goal_id, project_id, area_id, parent_id, 'planned', important, urgent,
             estimate_minutes,
             CASE WHEN due_date IS NOT NULL THEN $nextDate ELSE NULL END,
             CASE WHEN scheduled_date IS NOT NULL THEN $nextDate ELSE NULL END,
             start_min, end_min, waiting_on, recurrence, recurrence_until,
             COALESCE(series_id, id), $now, $now
           FROM tasks WHERE id = $id`,
          { newId: nextId, nextDate, now, id },
        );
        logEvent(nextId, "created", "recurring instance");
      }
    }
  });
  touch();
}

export async function toggleTaskDone(id: string): Promise<void> {
  const task = get<Task>("SELECT status FROM tasks WHERE id = ?", id);
  if (!task) return;
  await setTaskStatus(id, task.status === "done" ? "planned" : "done");
}

export async function scheduleTask(
  id: string,
  date: string | null,
  startMin: number | null = null,
  durationMin: number | null = null,
): Promise<void> {
  const task = get<Task>("SELECT * FROM tasks WHERE id = ?", id);
  if (!task) return;
  const duration = durationMin ?? task.estimate_minutes ?? 60;
  const endMin = startMin == null ? null : Math.min(startMin + duration, 24 * 60);

  run(
    `UPDATE tasks SET scheduled_date = ?, start_min = ?, end_min = ?,
       status = CASE WHEN status = 'inbox' AND ? IS NOT NULL THEN 'planned' ELSE status END,
       updated_at = ? WHERE id = ?`,
    date,
    startMin,
    endMin,
    date,
    nowISO(),
    id,
  );
  logEvent(id, "scheduled", date ? `${date}${startMin != null ? ` ${startMin}` : ""}` : "cleared");
  touch();
}

export async function resizeTask(id: string, durationMin: number): Promise<void> {
  const task = get<Task>("SELECT * FROM tasks WHERE id = ?", id);
  if (!task || task.start_min == null) return;
  run(
    "UPDATE tasks SET end_min = ?, estimate_minutes = ?, updated_at = ? WHERE id = ?",
    Math.min(task.start_min + durationMin, 24 * 60),
    durationMin,
    nowISO(),
    id,
  );
  touch();
}

export async function postponeTask(id: string, days: number): Promise<void> {
  const task = get<Task>("SELECT * FROM tasks WHERE id = ?", id);
  if (!task) return;
  const base = task.scheduled_date ?? todayISO();
  const next = addDaysISO(base, days);
  run(
    `UPDATE tasks SET scheduled_date = ?, postponed_count = postponed_count + 1,
       status = CASE WHEN status = 'inbox' THEN 'planned' ELSE status END,
       updated_at = ? WHERE id = ?`,
    next,
    nowISO(),
    id,
  );
  logEvent(id, "postponed", `${base} -> ${next}`);
  touch();
}

export async function archiveTask(id: string, archived = true): Promise<void> {
  run("UPDATE tasks SET archived = ?, updated_at = ? WHERE id = ?", archived ? 1 : 0, nowISO(), id);
  logEvent(id, archived ? "archived" : "unarchived");
  touch();
}

export async function deleteTask(id: string): Promise<void> {
  run("DELETE FROM tasks WHERE id = ?", id);
  touch();
}

export async function addSubtask(parentId: string, title: string): Promise<void> {
  if (!title.trim()) return;
  const parent = get<Task>("SELECT * FROM tasks WHERE id = ?", parentId);
  if (!parent) return;
  await createTask({
    title,
    parent_id: parentId,
    project_id: parent.project_id,
    goal_id: parent.goal_id,
    area_id: parent.area_id,
    status: "planned",
  });
}

export async function addDependency(taskId: string, dependsOnId: string): Promise<void> {
  if (!dependsOnId || taskId === dependsOnId) return;
  run(
    "INSERT OR IGNORE INTO task_deps(task_id, depends_on_id) VALUES(?, ?)",
    taskId,
    dependsOnId,
  );
  logEvent(taskId, "dependency", `waits for ${dependsOnId}`);
  touch();
}

export async function removeDependency(taskId: string, dependsOnId: string): Promise<void> {
  run("DELETE FROM task_deps WHERE task_id = ? AND depends_on_id = ?", taskId, dependsOnId);
  touch();
}

export async function logTime(taskId: string, minutes: number, date?: string): Promise<void> {
  if (!minutes) return;
  run(
    "INSERT INTO time_logs(id, task_id, date, minutes, note, created_at) VALUES(?, ?, ?, ?, ?, ?)",
    newId(),
    taskId,
    date ?? todayISO(),
    minutes,
    null,
    nowISO(),
  );
  logEvent(taskId, "time", `${minutes}m`);
  touch();
}

export async function saveReflection(
  taskId: string,
  data: { met_expectation?: string; contributed?: string; next_step?: string },
): Promise<void> {
  run(
    `INSERT INTO task_reflections(id, task_id, met_expectation, contributed, next_step, created_at)
     VALUES(?, ?, ?, ?, ?, ?)`,
    newId(),
    taskId,
    data.met_expectation ?? null,
    data.contributed ?? null,
    data.next_step ?? null,
    nowISO(),
  );
  if (data.next_step) {
    run("UPDATE tasks SET next_action = ?, updated_at = ? WHERE id = ?", data.next_step, nowISO(), taskId);
  }
  touch();
}

export async function toggleFocus(date: string, taskId: string): Promise<void> {
  const existing = get<{ task_id: string }>(
    "SELECT task_id FROM day_focus WHERE date = ? AND task_id = ?",
    date,
    taskId,
  );
  if (existing) {
    run("DELETE FROM day_focus WHERE date = ? AND task_id = ?", date, taskId);
  } else {
    const count = get<{ n: number }>("SELECT COUNT(*) AS n FROM day_focus WHERE date = ?", date);
    run(
      "INSERT INTO day_focus(date, task_id, position) VALUES(?, ?, ?)",
      date,
      taskId,
      count?.n ?? 0,
    );
    run(
      `UPDATE tasks SET scheduled_date = COALESCE(scheduled_date, ?),
         status = CASE WHEN status = 'inbox' THEN 'planned' ELSE status END,
         updated_at = ? WHERE id = ?`,
      date,
      nowISO(),
      taskId,
    );
  }
  touch();
}

/* ------------------------------------------------------------------ strategy */

export async function createVision(input: { title: string; description?: string; horizon?: string }) {
  const id = newId();
  run(
    "INSERT INTO visions(id, title, description, horizon, position, created_at) VALUES(?, ?, ?, ?, ?, ?)",
    id,
    input.title.trim(),
    input.description ?? null,
    input.horizon ?? null,
    0,
    nowISO(),
  );
  touch();
  return id;
}

export async function updateVision(id: string, patch: { title?: string; description?: string; horizon?: string; archived?: boolean }) {
  const sets: string[] = [];
  const values: unknown[] = [];
  if (patch.title !== undefined) (sets.push("title = ?"), values.push(patch.title));
  if (patch.description !== undefined) (sets.push("description = ?"), values.push(patch.description || null));
  if (patch.horizon !== undefined) (sets.push("horizon = ?"), values.push(patch.horizon || null));
  if (patch.archived !== undefined) (sets.push("archived = ?"), values.push(patch.archived ? 1 : 0));
  if (!sets.length) return;
  run(`UPDATE visions SET ${sets.join(", ")} WHERE id = ?`, ...values, id);
  touch();
}

export interface GoalInput {
  title: string;
  vision_id?: string | null;
  area_id?: string | null;
  description?: string | null;
  metric?: string | null;
  start_date?: string | null;
  target_date?: string | null;
  status?: string;
}

export async function createGoal(input: GoalInput) {
  const id = newId();
  const now = nowISO();
  run(
    `INSERT INTO goals(id, vision_id, area_id, title, description, metric, start_date, target_date,
       status, position, created_at, updated_at)
     VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    id,
    input.vision_id || null,
    input.area_id || null,
    input.title.trim(),
    input.description || null,
    input.metric || null,
    input.start_date || null,
    input.target_date || null,
    input.status ?? "active",
    now,
    now,
  );
  touch();
  return id;
}

export async function updateGoal(id: string, patch: Partial<GoalInput> & { archived?: boolean }) {
  const columns = ["vision_id", "area_id", "title", "description", "metric", "start_date", "target_date", "status"];
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const column of columns) {
    if (column in patch) {
      sets.push(`${column} = ?`);
      const value = (patch as Record<string, unknown>)[column];
      values.push(value === "" ? null : value);
    }
  }
  if (patch.archived !== undefined) (sets.push("archived = ?"), values.push(patch.archived ? 1 : 0));
  if (!sets.length) return;
  run(`UPDATE goals SET ${sets.join(", ")}, updated_at = ? WHERE id = ?`, ...values, nowISO(), id);
  touch();
}

export interface StrategyInput {
  title: string;
  goal_id?: string | null;
  description?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  status?: string;
}

export async function createStrategy(input: StrategyInput) {
  const id = newId();
  const now = nowISO();
  run(
    `INSERT INTO strategies(id, goal_id, title, description, start_date, end_date, status,
       position, created_at, updated_at)
     VALUES(?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    id,
    input.goal_id || null,
    input.title.trim(),
    input.description || null,
    input.start_date || null,
    input.end_date || null,
    input.status ?? "active",
    now,
    now,
  );
  touch();
  return id;
}

export async function updateStrategy(id: string, patch: Partial<StrategyInput> & { archived?: boolean }) {
  const columns = ["goal_id", "title", "description", "start_date", "end_date", "status"];
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const column of columns) {
    if (column in patch) {
      sets.push(`${column} = ?`);
      const value = (patch as Record<string, unknown>)[column];
      values.push(value === "" ? null : value);
    }
  }
  if (patch.archived !== undefined) (sets.push("archived = ?"), values.push(patch.archived ? 1 : 0));
  if (!sets.length) return;
  run(`UPDATE strategies SET ${sets.join(", ")}, updated_at = ? WHERE id = ?`, ...values, nowISO(), id);
  touch();
}

export interface ProjectInput {
  title: string;
  strategy_id?: string | null;
  goal_id?: string | null;
  area_id?: string | null;
  description?: string | null;
  status?: string;
  start_date?: string | null;
  due_date?: string | null;
  color?: string;
}

export async function createProject(input: ProjectInput) {
  const id = newId();
  const now = nowISO();
  run(
    `INSERT INTO projects(id, strategy_id, goal_id, area_id, title, description, status,
       start_date, due_date, color, position, created_at, updated_at)
     VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    id,
    input.strategy_id || null,
    input.goal_id || null,
    input.area_id || null,
    input.title.trim(),
    input.description || null,
    input.status ?? "active",
    input.start_date || null,
    input.due_date || null,
    input.color ?? "indigo",
    now,
    now,
  );
  touch();
  return id;
}

export async function updateProject(id: string, patch: Partial<ProjectInput> & { archived?: boolean }) {
  const columns = ["strategy_id", "goal_id", "area_id", "title", "description", "status", "start_date", "due_date", "color"];
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const column of columns) {
    if (column in patch) {
      sets.push(`${column} = ?`);
      const value = (patch as Record<string, unknown>)[column];
      values.push(value === "" ? null : value);
    }
  }
  if (patch.archived !== undefined) (sets.push("archived = ?"), values.push(patch.archived ? 1 : 0));
  if (!sets.length) return;
  run(`UPDATE projects SET ${sets.join(", ")}, updated_at = ? WHERE id = ?`, ...values, nowISO(), id);
  touch();
}

export async function createMilestone(projectId: string, title: string, date: string | null) {
  if (!title.trim()) return;
  run(
    "INSERT INTO milestones(id, project_id, title, date, done, created_at) VALUES(?, ?, ?, ?, 0, ?)",
    newId(),
    projectId,
    title.trim(),
    date || null,
    nowISO(),
  );
  touch();
}

export async function toggleMilestone(id: string) {
  run("UPDATE milestones SET done = 1 - done WHERE id = ?", id);
  touch();
}

export async function deleteMilestone(id: string) {
  run("DELETE FROM milestones WHERE id = ?", id);
  touch();
}

/* --------------------------------------------------------------------- notes */

const LINK_PATTERN = /\[\[([^\]]+)\]\]/g;

function syncNoteLinks(noteId: string, content: string) {
  run("DELETE FROM note_links WHERE from_id = ?", noteId);
  const titles = new Set<string>();
  for (const match of content.matchAll(LINK_PATTERN)) titles.add(match[1].trim());
  for (const title of titles) {
    const target = get<{ id: string }>(
      "SELECT id FROM notes WHERE title = ? COLLATE NOCASE LIMIT 1",
      title,
    );
    if (target && target.id !== noteId) {
      run("INSERT OR IGNORE INTO note_links(from_id, to_id) VALUES(?, ?)", noteId, target.id);
    }
  }
}

export interface NoteInput {
  title?: string;
  content?: string;
  kind?: string;
  date?: string | null;
  project_id?: string | null;
  goal_id?: string | null;
  task_id?: string | null;
  tags?: string[];
}

export async function createNote(input: NoteInput): Promise<string> {
  const id = newId();
  const now = nowISO();
  tx(() => {
    run(
      `INSERT INTO notes(id, title, content, kind, date, project_id, goal_id, task_id,
         created_at, updated_at)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      input.title?.trim() || "Untitled note",
      input.content ?? "",
      input.kind ?? "quick",
      input.date || null,
      input.project_id || null,
      input.goal_id || null,
      input.task_id || null,
      now,
      now,
    );
    for (const tag of input.tags ?? []) {
      const tagId = ensureTag(tag);
      if (tagId) run("INSERT OR IGNORE INTO note_tags(note_id, tag_id) VALUES(?, ?)", id, tagId);
    }
    syncNoteLinks(id, input.content ?? "");
  });
  touch();
  return id;
}

export async function updateNote(id: string, patch: NoteInput): Promise<void> {
  const columns = ["title", "content", "kind", "date", "project_id", "goal_id", "task_id"];
  tx(() => {
    const sets: string[] = [];
    const values: unknown[] = [];
    for (const column of columns) {
      if (column in patch) {
        sets.push(`${column} = ?`);
        const value = (patch as Record<string, unknown>)[column];
        values.push(value === "" && column !== "content" && column !== "title" ? null : value);
      }
    }
    if (sets.length) {
      run(`UPDATE notes SET ${sets.join(", ")}, updated_at = ? WHERE id = ?`, ...values, nowISO(), id);
    }
    if (patch.tags) {
      run("DELETE FROM note_tags WHERE note_id = ?", id);
      for (const tag of patch.tags) {
        const tagId = ensureTag(tag);
        if (tagId) run("INSERT OR IGNORE INTO note_tags(note_id, tag_id) VALUES(?, ?)", id, tagId);
      }
    }
    if (patch.content !== undefined) syncNoteLinks(id, patch.content);
    if (patch.title !== undefined) {
      // A renamed note may now be the target of [[links]] written earlier.
      const others = all<{ id: string; content: string }>("SELECT id, content FROM notes");
      for (const note of others) if (note.id !== id) syncNoteLinks(note.id, note.content);
    }
  });
  touch();
}

export async function toggleNotePin(id: string) {
  run("UPDATE notes SET pinned = 1 - pinned, updated_at = ? WHERE id = ?", nowISO(), id);
  touch();
}

export async function archiveNote(id: string, archived = true) {
  run("UPDATE notes SET archived = ?, updated_at = ? WHERE id = ?", archived ? 1 : 0, nowISO(), id);
  touch();
}

export async function deleteNote(id: string) {
  run("DELETE FROM notes WHERE id = ?", id);
  touch();
}

/** Turn one line of a note into a task, keeping the note's project/goal context. */
export async function noteLineToTask(
  noteId: string,
  line: string,
  extra: Partial<TaskInput> = {},
): Promise<string | null> {
  const note = get<Note>("SELECT * FROM notes WHERE id = ?", noteId);
  if (!note) return null;
  const title = line.replace(/^\s*(?:[-*]\s*)?(?:\[[ xX]\]\s*)?/, "").trim();
  if (!title) return null;
  const id = await createTask({
    title,
    project_id: extra.project_id ?? note.project_id,
    goal_id: extra.goal_id ?? note.goal_id,
    notes: `From note: [[${note.title}]] (note:${note.id})`,
    ...extra,
  });
  return id;
}

export async function ensureDailyNote(date: string): Promise<string> {
  const existing = get<{ id: string }>(
    "SELECT id FROM notes WHERE kind = 'daily' AND date = ?",
    date,
  );
  if (existing) return existing.id;
  return createNote({
    title: `Daily note ${date}`,
    kind: "daily",
    date,
    content: `## Intentions\n\n## Log\n\n## Ideas\n`,
  });
}

/* ------------------------------------------------------------------- reviews */

export async function saveReview(
  kind: "daily" | "weekly" | "monthly",
  periodKey: string,
  data: Record<string, string>,
): Promise<void> {
  const now = nowISO();
  run(
    `INSERT INTO reviews(id, kind, period_key, data, created_at, updated_at)
     VALUES(?, ?, ?, ?, ?, ?)
     ON CONFLICT(kind, period_key) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    newId(),
    kind,
    periodKey,
    JSON.stringify(data),
    now,
    now,
  );
  touch();
}

/* ------------------------------------------------------------ areas/settings */

export async function createArea(name: string, color: string) {
  if (!name.trim()) return;
  run(
    "INSERT INTO areas(id, name, color, position, created_at) VALUES(?, ?, ?, ?, ?)",
    newId(),
    name.trim(),
    color,
    99,
    nowISO(),
  );
  touch();
}

export async function deleteArea(id: string) {
  run("DELETE FROM areas WHERE id = ?", id);
  touch();
}

export async function updateSettings(values: Record<string, string>) {
  for (const [key, value] of Object.entries(values)) {
    run(
      "INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      key,
      value,
    );
  }
  touch();
}
