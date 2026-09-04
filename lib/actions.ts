"use server";

import { revalidatePath } from "next/cache";
import { all, get, run, tx } from "./db";
import { listNotes, listTasks, searchAll, type SearchHit } from "./queries";
import { TASK_STATUSES, type Note, type Task, type TaskStatus } from "./types";
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
         project_id, area_id, parent_id, status, important, urgent, estimate_minutes,
         due_date, scheduled_date, start_min, end_min, waiting_on, recurrence, series_id,
         created_at, updated_at)
       VALUES($id, $title, $notes, $sto, $ltc, $next, $project, $area, $parent, $status,
         $important, $urgent, $estimate, $due, $sched, $start, $end, $waiting, $rec, $series,
         $now, $now)`,
      {
        id,
        title: input.title.trim(),
        notes: input.notes ?? null,
        sto: input.short_term_outcome ?? null,
        ltc: input.long_term_contribution ?? null,
        next: input.next_action ?? null,
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
             next_action, project_id, area_id, parent_id, status, important, urgent,
             estimate_minutes, due_date, scheduled_date, start_min, end_min, waiting_on,
             recurrence, recurrence_until, series_id, created_at, updated_at)
           SELECT $newId, title, notes, short_term_outcome, long_term_contribution, next_action,
             project_id, area_id, parent_id, 'planned', important, urgent,
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

/* ------------------------------------------------------------------ projects */

export interface ProjectInput {
  title: string;
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
    `INSERT INTO projects(id, area_id, title, description, status,
       start_date, due_date, color, position, created_at, updated_at)
     VALUES(?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    id,
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
  const columns = ["area_id", "title", "description", "status", "start_date", "due_date", "color"];
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
  parent_id?: string | null;
  icon?: string | null;
  cover?: string | null;
  position?: number;
  project_id?: string | null;
  task_id?: string | null;
  tags?: string[];
}

/** Next free slot among a parent's children, so a new page lands at the bottom. */
function nextNotePosition(parentId: string | null): number {
  const row = get<{ next: number }>(
    parentId
      ? "SELECT COALESCE(MAX(position), -1) + 1 AS next FROM notes WHERE parent_id = ?"
      : "SELECT COALESCE(MAX(position), -1) + 1 AS next FROM notes WHERE parent_id IS NULL",
    ...(parentId ? [parentId] : []),
  );
  return row?.next ?? 0;
}

export async function createNote(input: NoteInput): Promise<string> {
  const id = newId();
  const now = nowISO();
  tx(() => {
    run(
      `INSERT INTO notes(id, title, content, kind, date, parent_id, icon, cover, position,
         project_id, task_id, created_at, updated_at)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      input.title?.trim() || "Untitled note",
      input.content ?? "",
      input.kind ?? "quick",
      input.date || null,
      input.parent_id || null,
      input.icon || null,
      input.cover || null,
      input.position ?? nextNotePosition(input.parent_id || null),
      input.project_id || null,
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
  const columns = [
    "title", "content", "kind", "date", "parent_id", "icon", "cover", "position",
    "project_id", "task_id",
  ];
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

/** True when `candidate` sits inside `id`'s subtree — a move there would orphan it. */
function isDescendant(id: string, candidate: string): boolean {
  const seen = new Set<string>();
  let cursor: string | null = candidate;
  while (cursor && !seen.has(cursor)) {
    if (cursor === id) return true;
    seen.add(cursor);
    const row: { parent_id: string | null } | undefined = get(
      "SELECT parent_id FROM notes WHERE id = ?",
      cursor,
    );
    cursor = row?.parent_id ?? null;
  }
  return false;
}

/** Renumber one parent's children 0..n so later inserts have room. */
function resequence(parentId: string | null) {
  const children = all<{ id: string }>(
    parentId
      ? "SELECT id FROM notes WHERE parent_id = ? ORDER BY position, created_at"
      : "SELECT id FROM notes WHERE parent_id IS NULL ORDER BY position, created_at",
    ...(parentId ? [parentId] : []),
  );
  children.forEach((child, index) => run("UPDATE notes SET position = ? WHERE id = ?", index, child.id));
}

/** Move a page under a new parent, optionally dropping it before a given sibling. */
export async function moveNote(
  id: string,
  parentId: string | null,
  beforeId: string | null = null,
): Promise<boolean> {
  if (id === parentId) return false;
  if (parentId && isDescendant(id, parentId)) return false;
  tx(() => {
    const previous = get<{ parent_id: string | null }>("SELECT parent_id FROM notes WHERE id = ?", id);
    run(
      "UPDATE notes SET parent_id = ?, position = ?, updated_at = ? WHERE id = ?",
      parentId,
      nextNotePosition(parentId),
      nowISO(),
      id,
    );
    if (beforeId && beforeId !== id) {
      const siblings = all<{ id: string }>(
        parentId
          ? "SELECT id FROM notes WHERE parent_id = ? ORDER BY position, created_at"
          : "SELECT id FROM notes WHERE parent_id IS NULL ORDER BY position, created_at",
        ...(parentId ? [parentId] : []),
      ).map((row) => row.id);
      const ordered = siblings.filter((sibling) => sibling !== id);
      const target = ordered.indexOf(beforeId);
      ordered.splice(target === -1 ? ordered.length : target, 0, id);
      ordered.forEach((sibling, index) =>
        run("UPDATE notes SET position = ? WHERE id = ?", index, sibling),
      );
    }
    if (previous && previous.parent_id !== parentId) resequence(previous.parent_id);
  });
  touch();
  return true;
}

/** Copy a page and everything under it. Returns the new root page's id. */
export async function duplicateNote(id: string, parentId?: string | null): Promise<string | null> {
  const source = get<Note>("SELECT * FROM notes WHERE id = ?", id);
  if (!source) return null;

  const copySubtree = (note: Note, parent: string | null, title: string): string => {
    const newNoteId = newId();
    const now = nowISO();
    run(
      `INSERT INTO notes(id, title, content, kind, date, parent_id, icon, cover, position,
         project_id, task_id, pinned, archived, created_at, updated_at)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      newNoteId,
      title,
      note.content,
      note.kind,
      note.date,
      parent,
      note.icon,
      note.cover,
      nextNotePosition(parent),
      note.project_id,
      note.task_id,
      note.archived,
      now,
      now,
    );
    for (const tag of all<{ tag_id: string }>("SELECT tag_id FROM note_tags WHERE note_id = ?", note.id)) {
      run("INSERT OR IGNORE INTO note_tags(note_id, tag_id) VALUES(?, ?)", newNoteId, tag.tag_id);
    }
    syncNoteLinks(newNoteId, note.content);
    for (const child of all<Note>(
      "SELECT * FROM notes WHERE parent_id = ? ORDER BY position, created_at",
      note.id,
    )) {
      copySubtree(child, newNoteId, child.title);
    }
    return newNoteId;
  };

  const copyId = tx(() =>
    copySubtree(
      source,
      parentId === undefined ? source.parent_id : parentId,
      `${source.title} (copy)`,
    ),
  );
  touch();
  return copyId;
}

/** Create a page nested under another one and return its id. */
export async function createChildNote(parentId: string, title = "Untitled"): Promise<string> {
  const parent = get<Note>("SELECT * FROM notes WHERE id = ?", parentId);
  return createNote({
    title,
    parent_id: parentId,
    project_id: parent?.project_id ?? null,
  });
}

/** Emoji icon and preset cover live on the page itself; null clears them. */
export async function setNoteAppearance(
  id: string,
  patch: { icon?: string | null; cover?: string | null },
): Promise<void> {
  const sets: string[] = [];
  const values: unknown[] = [];
  if ("icon" in patch) {
    sets.push("icon = ?");
    values.push(patch.icon || null);
  }
  if ("cover" in patch) {
    sets.push("cover = ?");
    values.push(patch.cover || null);
  }
  if (!sets.length) return;
  run(`UPDATE notes SET ${sets.join(", ")}, updated_at = ? WHERE id = ?`, ...values, nowISO(), id);
  touch();
}

/** Turn one line of a note into a task, keeping the note's project context. */
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

/* ---------------------------------------------------------- note embeds */

export interface EmbeddedTask {
  id: string;
  title: string;
  status: TaskStatus;
  due_date: string | null;
  scheduled_date: string | null;
  estimate_minutes: number | null;
  project_title: string | null;
  project_color: string | null;
}

/** Live tasks for a `::tasks` block. Empty filters mean "this page's project". */
export async function embedTasks(filter: {
  projectId?: string | null;
  status?: string | null;
  limit?: number;
}): Promise<EmbeddedTask[]> {
  const status = (filter.status ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value): value is TaskStatus => TASK_STATUSES.includes(value as TaskStatus));

  const tasks = listTasks({
    projectId: filter.projectId || undefined,
    status: status.length ? status : undefined,
    includeDone: status.includes("done") || !status.length,
    parentId: null,
    limit: Math.min(Math.max(filter.limit ?? 8, 1), 50),
  });

  return tasks.map((task) => ({
    id: task.id,
    title: task.title,
    status: task.status,
    due_date: task.due_date,
    scheduled_date: task.scheduled_date,
    estimate_minutes: task.estimate_minutes,
    project_title: task.project_title,
    project_color: task.project_color,
  }));
}

/* -------------------------------------------------------------- palette */

/** Ranked search for the command palette. */
export async function searchCommand(query: string): Promise<SearchHit[]> {
  return searchAll(query, 20);
}

/** What the palette offers before anything is typed. */
export async function recentTargets(): Promise<SearchHit[]> {
  return listNotes({ limit: 8 }).map((note) => ({
    kind: "note" as const,
    id: note.id,
    title: note.title || "Untitled",
    snippet: note.content.slice(0, 120).replace(/\s+/g, " ").trim(),
    icon: note.icon,
    context: null,
    href: `/notes/${note.id}`,
  }));
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
