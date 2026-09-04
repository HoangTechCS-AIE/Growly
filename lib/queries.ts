import "server-only";
import { all, get } from "./db";
import type {
  Area, Milestone, Note, NoteTreeItem, NoteView, ProjectView, Reflection,
  SearchHit, SearchKind, Settings, Tag, Task, TaskEvent, TaskStatus,
  TaskView, TimeLog,
} from "./types";
import { SNIPPET_CLOSE, SNIPPET_OPEN, STATUS_LABEL } from "./types";
export type { SearchHit, SearchKind } from "./types";
import { addDaysISO, todayISO } from "./util";
import { normalizeAccent } from "./accents";

/* ------------------------------------------------------------------ settings */

export function getSettings(): Settings {
  const rows = all<{ key: string; value: string }>("SELECT key, value FROM settings");
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    day_start_min: Number(map.day_start_min ?? 480),
    day_end_min: Number(map.day_end_min ?? 1320),
    daily_capacity_min: Number(map.daily_capacity_min ?? 360),
    week_starts_on: Number(map.week_starts_on ?? 1),
    accent: normalizeAccent(map.accent),
  };
}

/* ------------------------------------------------------------ areas and tags */

export function listAreas(): Area[] {
  return all<Area>("SELECT * FROM areas ORDER BY position, name");
}

export function listTags(): (Tag & { usage: number })[] {
  return all<Tag & { usage: number }>(`
    SELECT tg.*,
      (SELECT COUNT(*) FROM task_tags tt WHERE tt.tag_id = tg.id)
      + (SELECT COUNT(*) FROM note_tags nt WHERE nt.tag_id = tg.id) AS usage
    FROM tags tg ORDER BY tg.name`);
}

/* ------------------------------------------------------------------ projects */

const PROJECT_SELECT = `
  SELECT p.*,
    (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.archived = 0) AS task_total,
    (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.archived = 0
       AND t.status = 'done') AS task_done,
    (SELECT COUNT(*) FROM notes n WHERE n.project_id = p.id AND n.archived = 0) AS note_total,
    (SELECT MAX(t.updated_at) FROM tasks t WHERE t.project_id = p.id) AS last_activity
  FROM projects p`;

export function listProjects(opts: { status?: string } = {}): ProjectView[] {
  const where = ["p.archived = 0"];
  const params: unknown[] = [];
  if (opts.status) {
    where.push("p.status = ?");
    params.push(opts.status);
  }
  return all<ProjectView>(
    `${PROJECT_SELECT} WHERE ${where.join(" AND ")} ORDER BY p.position, p.created_at`,
    ...params,
  );
}

export function getProject(id: string): ProjectView | undefined {
  return get<ProjectView>(`${PROJECT_SELECT} WHERE p.id = ?`, id);
}

export function listMilestones(opts: { projectId?: string; from?: string; to?: string } = {}): (Milestone & {
  project_title: string | null;
  project_color: string | null;
})[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.projectId) {
    where.push("m.project_id = ?");
    params.push(opts.projectId);
  }
  if (opts.from) {
    where.push("m.date >= ?");
    params.push(opts.from);
  }
  if (opts.to) {
    where.push("m.date <= ?");
    params.push(opts.to);
  }
  return all(
    `SELECT m.*, p.title AS project_title, p.color AS project_color
     FROM milestones m LEFT JOIN projects p ON p.id = m.project_id
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY m.date`,
    ...params,
  );
}

/* --------------------------------------------------------------------- tasks */

const TASK_SELECT = `
  SELECT t.*,
    p.title AS project_title,
    p.color AS project_color,
    a.name  AS area_name,
    a.color AS area_color,
    (SELECT COUNT(*) FROM tasks st WHERE st.parent_id = t.id AND st.archived = 0) AS subtask_total,
    (SELECT COUNT(*) FROM tasks st WHERE st.parent_id = t.id AND st.archived = 0
       AND st.status = 'done') AS subtask_done,
    (SELECT COUNT(*) FROM task_deps d JOIN tasks dt ON dt.id = d.depends_on_id
       WHERE d.task_id = t.id AND dt.status <> 'done') AS blocked_by,
    (SELECT COUNT(*) FROM day_focus f WHERE f.task_id = t.id AND f.date = ?) AS is_focus
  FROM tasks t
  LEFT JOIN projects p ON p.id = t.project_id
  LEFT JOIN areas a    ON a.id = COALESCE(t.area_id, p.area_id)`;

export interface TaskFilter {
  status?: TaskStatus[];
  projectId?: string;
  areaId?: string;
  tagId?: string;
  parentId?: string | null;
  search?: string;
  scheduledOn?: string;
  scheduledFrom?: string;
  scheduledTo?: string;
  dueBefore?: string;
  dueOn?: string;
  unscheduled?: boolean;
  includeDone?: boolean;
  includeArchived?: boolean;
  focusDate?: string;
  important?: boolean;
  urgent?: boolean;
  order?: string;
  limit?: number;
}

export function listTasks(f: TaskFilter = {}, today = todayISO()): TaskView[] {
  const where: string[] = [];
  const params: unknown[] = [today];

  if (!f.includeArchived) where.push("t.archived = 0");
  if (f.status?.length) {
    where.push(`t.status IN (${f.status.map(() => "?").join(", ")})`);
    params.push(...f.status);
  } else if (!f.includeDone) {
    where.push("t.status <> 'done'");
  }
  if (f.projectId) {
    where.push("t.project_id = ?");
    params.push(f.projectId);
  }
  if (f.areaId) {
    where.push("COALESCE(t.area_id, p.area_id) = ?");
    params.push(f.areaId);
  }
  if (f.tagId) {
    where.push("EXISTS (SELECT 1 FROM task_tags tt WHERE tt.task_id = t.id AND tt.tag_id = ?)");
    params.push(f.tagId);
  }
  if (f.parentId === null) where.push("t.parent_id IS NULL");
  else if (f.parentId) {
    where.push("t.parent_id = ?");
    params.push(f.parentId);
  }
  if (f.search) {
    where.push(`(t.title LIKE ? OR t.notes LIKE ? OR t.short_term_outcome LIKE ?
       OR t.long_term_contribution LIKE ? OR t.next_action LIKE ?)`);
    const like = `%${f.search}%`;
    params.push(like, like, like, like, like);
  }
  if (f.scheduledOn) {
    where.push("t.scheduled_date = ?");
    params.push(f.scheduledOn);
  }
  if (f.scheduledFrom) {
    where.push("t.scheduled_date >= ?");
    params.push(f.scheduledFrom);
  }
  if (f.scheduledTo) {
    where.push("t.scheduled_date <= ?");
    params.push(f.scheduledTo);
  }
  if (f.dueBefore) {
    where.push("t.due_date IS NOT NULL AND t.due_date < ?");
    params.push(f.dueBefore);
  }
  if (f.dueOn) {
    where.push("t.due_date = ?");
    params.push(f.dueOn);
  }
  if (f.unscheduled) where.push("t.scheduled_date IS NULL");
  if (f.focusDate) {
    where.push("EXISTS (SELECT 1 FROM day_focus df WHERE df.task_id = t.id AND df.date = ?)");
    params.push(f.focusDate);
  }
  if (f.important) where.push("t.important = 1");
  if (f.urgent) where.push("t.urgent = 1");

  const order =
    f.order ??
    `(t.status = 'done'), COALESCE(t.scheduled_date, t.due_date, '9999-12-31'),
     COALESCE(t.start_min, 9999), t.important DESC, t.urgent DESC, t.position, t.created_at`;

  const sql = `${TASK_SELECT}
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY ${order}
    ${f.limit ? `LIMIT ${Number(f.limit)}` : ""}`;

  return withTags(all<TaskView>(sql, ...params));
}

export function getTask(id: string, today = todayISO()): TaskView | undefined {
  const task = get<TaskView>(`${TASK_SELECT} WHERE t.id = ?`, today, id);
  return task ? withTags([task])[0] : undefined;
}

function withTags(tasks: TaskView[]): TaskView[] {
  if (!tasks.length) return tasks;
  const rows = all<Tag & { task_id: string }>(
    `SELECT tt.task_id, tg.* FROM task_tags tt JOIN tags tg ON tg.id = tt.tag_id
     WHERE tt.task_id IN (${tasks.map(() => "?").join(",")}) ORDER BY tg.name`,
    ...tasks.map((t) => t.id),
  );
  const byTask = new Map<string, Tag[]>();
  for (const row of rows) {
    const { task_id, ...tag } = row;
    if (!byTask.has(task_id)) byTask.set(task_id, []);
    byTask.get(task_id)!.push(tag as Tag);
  }
  return tasks.map((t) => ({ ...t, tags: byTask.get(t.id) ?? [] }));
}

export function getTaskDeps(taskId: string) {
  return {
    blockedBy: all<Task>(
      `SELECT t.* FROM task_deps d JOIN tasks t ON t.id = d.depends_on_id
       WHERE d.task_id = ? ORDER BY t.title`,
      taskId,
    ),
    blocking: all<Task>(
      `SELECT t.* FROM task_deps d JOIN tasks t ON t.id = d.task_id
       WHERE d.depends_on_id = ? ORDER BY t.title`,
      taskId,
    ),
  };
}

export function getTaskEvents(taskId: string): TaskEvent[] {
  return all<TaskEvent>(
    "SELECT * FROM task_events WHERE task_id = ? ORDER BY created_at DESC LIMIT 50",
    taskId,
  );
}

export function getTaskReflection(taskId: string): Reflection | undefined {
  return get<Reflection>(
    "SELECT * FROM task_reflections WHERE task_id = ? ORDER BY created_at DESC LIMIT 1",
    taskId,
  );
}

export function getTimeLogs(taskId: string): TimeLog[] {
  return all<TimeLog>("SELECT * FROM time_logs WHERE task_id = ? ORDER BY date DESC", taskId);
}

export function loggedMinutes(taskId: string): number {
  const row = get<{ n: number }>(
    "SELECT COALESCE(SUM(minutes), 0) AS n FROM time_logs WHERE task_id = ?",
    taskId,
  );
  return row?.n ?? 0;
}

/* --------------------------------------------------------------------- notes */

const NOTE_SELECT = `
  SELECT n.*, p.title AS project_title
  FROM notes n
  LEFT JOIN projects p ON p.id = n.project_id`;

export interface NoteFilter {
  kind?: string;
  /** `null` keeps only top-level pages; an id keeps only that page's children. */
  parentId?: string | null;
  search?: string;
  tagId?: string;
  projectId?: string;
  taskId?: string;
  pinned?: boolean;
  includeArchived?: boolean;
  limit?: number;
}

export function listNotes(f: NoteFilter = {}): NoteView[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (!f.includeArchived) where.push("n.archived = 0");
  if (f.kind) {
    where.push("n.kind = ?");
    params.push(f.kind);
  }
  if (f.parentId === null) where.push("n.parent_id IS NULL");
  else if (f.parentId) {
    where.push("n.parent_id = ?");
    params.push(f.parentId);
  }
  if (f.search) {
    where.push("(n.title LIKE ? OR n.content LIKE ?)");
    params.push(`%${f.search}%`, `%${f.search}%`);
  }
  if (f.tagId) {
    where.push("EXISTS (SELECT 1 FROM note_tags nt WHERE nt.note_id = n.id AND nt.tag_id = ?)");
    params.push(f.tagId);
  }
  if (f.projectId) {
    where.push("n.project_id = ?");
    params.push(f.projectId);
  }
  if (f.taskId) {
    where.push("n.task_id = ?");
    params.push(f.taskId);
  }
  if (f.pinned) where.push("n.pinned = 1");

  const notes = all<NoteView>(
    `${NOTE_SELECT} ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY n.pinned DESC, n.updated_at DESC ${f.limit ? `LIMIT ${Number(f.limit)}` : ""}`,
    ...params,
  );
  return withNoteTags(notes);
}

export function getNote(id: string): NoteView | undefined {
  const note = get<NoteView>(`${NOTE_SELECT} WHERE n.id = ?`, id);
  return note ? withNoteTags([note])[0] : undefined;
}

export function getNoteByTitle(title: string): Note | undefined {
  return get<Note>("SELECT * FROM notes WHERE title = ? COLLATE NOCASE LIMIT 1", title);
}

export function getDailyNote(date: string): Note | undefined {
  return get<Note>("SELECT * FROM notes WHERE kind = 'daily' AND date = ? LIMIT 1", date);
}

function withNoteTags(notes: NoteView[]): NoteView[] {
  if (!notes.length) return notes;
  const rows = all<Tag & { note_id: string }>(
    `SELECT nt.note_id, tg.* FROM note_tags nt JOIN tags tg ON tg.id = nt.tag_id
     WHERE nt.note_id IN (${notes.map(() => "?").join(",")}) ORDER BY tg.name`,
    ...notes.map((n) => n.id),
  );
  const byNote = new Map<string, Tag[]>();
  for (const row of rows) {
    const { note_id, ...tag } = row;
    if (!byNote.has(note_id)) byNote.set(note_id, []);
    byNote.get(note_id)!.push(tag as Tag);
  }
  return notes.map((n) => ({ ...n, tags: byNote.get(n.id) ?? [] }));
}

export function getBacklinks(noteId: string): Note[] {
  return all<Note>(
    `SELECT n.* FROM note_links l JOIN notes n ON n.id = l.from_id
     WHERE l.to_id = ? AND n.archived = 0 ORDER BY n.updated_at DESC`,
    noteId,
  );
}

export function getOutlinks(noteId: string): Note[] {
  return all<Note>(
    `SELECT n.* FROM note_links l JOIN notes n ON n.id = l.to_id
     WHERE l.from_id = ? ORDER BY n.title`,
    noteId,
  );
}

/** Every non-archived page as a flat row; the sidebar assembles the tree. */
export function listNoteTree(includeArchived = false): NoteTreeItem[] {
  return all<NoteTreeItem>(
    `SELECT n.id, n.title, n.icon, n.parent_id, n.position, n.pinned, n.archived,
            (SELECT COUNT(*) FROM notes c WHERE c.parent_id = n.id AND c.archived = 0) AS child_count
     FROM notes n
     ${includeArchived ? "" : "WHERE n.archived = 0"}
     ORDER BY n.pinned DESC, n.position, n.updated_at DESC`,
  );
}

/** Root-first chain of parents, for the breadcrumb. Stops on a cycle. */
export function getNoteAncestors(id: string): { id: string; title: string; icon: string | null }[] {
  const chain: { id: string; title: string; icon: string | null }[] = [];
  const seen = new Set<string>([id]);
  let current = get<{ parent_id: string | null }>("SELECT parent_id FROM notes WHERE id = ?", id);
  while (current?.parent_id && !seen.has(current.parent_id)) {
    const parentId: string = current.parent_id;
    seen.add(parentId);
    const parent = get<{ id: string; title: string; icon: string | null; parent_id: string | null }>(
      "SELECT id, title, icon, parent_id FROM notes WHERE id = ?",
      parentId,
    );
    if (!parent) break;
    chain.unshift({ id: parent.id, title: parent.title, icon: parent.icon });
    current = { parent_id: parent.parent_id };
  }
  return chain;
}

export function listChildNotes(parentId: string, includeArchived = false): NoteTreeItem[] {
  return all<NoteTreeItem>(
    `SELECT n.id, n.title, n.icon, n.parent_id, n.position, n.pinned, n.archived,
            (SELECT COUNT(*) FROM notes c WHERE c.parent_id = n.id AND c.archived = 0) AS child_count
     FROM notes n
     WHERE n.parent_id = ? ${includeArchived ? "" : "AND n.archived = 0"}
     ORDER BY n.position, n.created_at`,
    parentId,
  );
}

export function getTasksFromNote(noteId: string, today = todayISO()): TaskView[] {
  return withTags(
    all<TaskView>(
      `${TASK_SELECT} WHERE t.id IN (SELECT task_id FROM notes WHERE id = ?)
         OR t.notes LIKE ?`,
      today,
      noteId,
      `%note:${noteId}%`,
    ),
  );
}

/* ----------------------------------------------------------------- dashboard */

export function capacityForDay(date: string) {
  const settings = getSettings();
  const row = get<{ planned: number; blocked: number }>(
    `SELECT COALESCE(SUM(COALESCE(t.estimate_minutes,
        CASE WHEN t.start_min IS NOT NULL AND t.end_min IS NOT NULL
             THEN t.end_min - t.start_min ELSE 0 END)), 0) AS planned,
       COALESCE(SUM(CASE WHEN t.start_min IS NOT NULL AND t.end_min IS NOT NULL
             THEN t.end_min - t.start_min ELSE 0 END), 0) AS blocked
     FROM tasks t
     WHERE t.scheduled_date = ? AND t.archived = 0 AND t.status <> 'done'`,
    date,
  );
  const logged = get<{ n: number }>(
    "SELECT COALESCE(SUM(minutes), 0) AS n FROM time_logs WHERE date = ?",
    date,
  );
  return {
    planned: row?.planned ?? 0,
    blocked: row?.blocked ?? 0,
    logged: logged?.n ?? 0,
    capacity: settings.daily_capacity_min,
    over: (row?.planned ?? 0) > settings.daily_capacity_min,
  };
}

export function capacityForRange(from: string, to: string) {
  return all<{ date: string; planned: number }>(
    `SELECT scheduled_date AS date,
       COALESCE(SUM(COALESCE(estimate_minutes,
         CASE WHEN start_min IS NOT NULL AND end_min IS NOT NULL
              THEN end_min - start_min ELSE 0 END)), 0) AS planned
     FROM tasks
     WHERE scheduled_date BETWEEN ? AND ? AND archived = 0 AND status <> 'done'
     GROUP BY scheduled_date`,
    from,
    to,
  );
}

export function loggedMinutesByDay(from: string, to: string) {
  return all<{ date: string; minutes: number }>(
    `SELECT date, SUM(minutes) AS minutes FROM time_logs
     WHERE date BETWEEN ? AND ? GROUP BY date`,
    from,
    to,
  );
}

/** Minutes logged per project over a period. */
export function timePerProject(from: string, to: string) {
  return all<{ project_id: string | null; project_title: string | null; minutes: number }>(
    `SELECT t.project_id AS project_id,
            p.title AS project_title,
            SUM(l.minutes) AS minutes
     FROM time_logs l
     JOIN tasks t ON t.id = l.task_id
     LEFT JOIN projects p ON p.id = t.project_id
     WHERE l.date BETWEEN ? AND ?
     GROUP BY 1, 2
     ORDER BY minutes DESC`,
    from,
    to,
  );
}

/** Share of the period's work that belongs to a project rather than floating loose. */
export function projectFocusScore(from: string, to: string) {
  const row = get<{ total: number; grouped: number }>(
    `SELECT COUNT(*) AS total,
       SUM(CASE WHEN t.project_id IS NOT NULL THEN 1 ELSE 0 END) AS grouped
     FROM tasks t
     WHERE t.archived = 0
       AND ((t.scheduled_date BETWEEN ? AND ?)
            OR (DATE(t.completed_at) BETWEEN ? AND ?))`,
    from,
    to,
    from,
    to,
  );
  const total = row?.total ?? 0;
  const grouped = row?.grouped ?? 0;
  return { total, grouped, score: total ? Math.round((grouped / total) * 100) : 0 };
}

export function weekStats(from: string, to: string) {
  const completed = get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM tasks
     WHERE status = 'done' AND DATE(completed_at) BETWEEN ? AND ?`,
    from,
    to,
  );
  const planned = get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM tasks
     WHERE archived = 0 AND scheduled_date BETWEEN ? AND ?`,
    from,
    to,
  );
  const logged = get<{ n: number }>(
    "SELECT COALESCE(SUM(minutes), 0) AS n FROM time_logs WHERE date BETWEEN ? AND ?",
    from,
    to,
  );
  return {
    completed: completed?.n ?? 0,
    planned: planned?.n ?? 0,
    loggedMinutes: logged?.n ?? 0,
  };
}

export function stuckItems(today = todayISO()) {
  const staleDate = addDaysISO(today, -14);
  const postponed = listTasks({ order: "t.postponed_count DESC, t.updated_at", limit: 8 }, today)
    .filter((t) => t.postponed_count >= 2);
  const staleProjects = all<ProjectView>(
    `${PROJECT_SELECT}
     WHERE p.archived = 0 AND p.status = 'active'
       AND (SELECT MAX(t.updated_at) FROM tasks t WHERE t.project_id = p.id) IS NOT NULL
       AND (SELECT MAX(t.updated_at) FROM tasks t WHERE t.project_id = p.id) < ?
     ORDER BY last_activity`,
    staleDate,
  );
  return { postponed, staleProjects };
}

/** Turn free text into an FTS5 MATCH expression: every word required, the last
 *  one treated as a prefix so results narrow as you type. "đ" is folded the
 *  same way it is in the index, so typing "doi" reaches "đổi". */
function ftsQuery(raw: string): string {
  const words = raw
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .trim()
    .split(/[^\p{L}\p{N}_]+/u)
    .filter(Boolean);
  if (!words.length) return "";
  return words
    .map((word, index) => (index === words.length - 1 ? `"${word}"*` : `"${word}"`))
    .join(" ");
}

/** One ranked list across notes, tasks and projects. */
export function searchAll(raw: string, limit = 30): SearchHit[] {
  const match = ftsQuery(raw);
  if (!match) return [];

  // Two snippets: prefer the one that actually highlights something, and never
  // read from `fold`, whose text has had its "đ" rewritten.
  let rows: {
    kind: SearchKind;
    ref_id: string;
    title: string;
    body_snippet: string;
    title_snippet: string;
  }[];
  try {
    rows = all(
      `SELECT kind, ref_id, title,
              snippet(search_index, 3, ?, ?, '…', 14) AS body_snippet,
              snippet(search_index, 2, ?, ?, '…', 14) AS title_snippet
       FROM search_index
       WHERE search_index MATCH ?
       ORDER BY bm25(search_index, 0.0, 0.0, 10.0, 1.0, 0.5)
       LIMIT ?`,
      SNIPPET_OPEN,
      SNIPPET_CLOSE,
      SNIPPET_OPEN,
      SNIPPET_CLOSE,
      match,
      limit,
    );
  } catch {
    // An expression FTS5 cannot parse means "no results", never a broken page.
    return [];
  }
  if (!rows.length) return [];

  const bestSnippet = (row: (typeof rows)[number]) =>
    row.body_snippet.includes(SNIPPET_OPEN)
      ? row.body_snippet
      : row.title_snippet.includes(SNIPPET_OPEN)
        ? row.title_snippet
        : row.body_snippet;

  const idsOf = (kind: SearchKind) => rows.filter((row) => row.kind === kind).map((row) => row.ref_id);
  const holes = (ids: string[]) => ids.map(() => "?").join(",");

  const noteIds = idsOf("note");
  const notes = new Map(
    (noteIds.length
      ? all<{ id: string; icon: string | null; parent_title: string | null }>(
          `SELECT n.id, n.icon, p.title AS parent_title
           FROM notes n LEFT JOIN notes p ON p.id = n.parent_id
           WHERE n.archived = 0 AND n.id IN (${holes(noteIds)})`,
          ...noteIds,
        )
      : []
    ).map((row) => [row.id, row]),
  );

  const taskIds = idsOf("task");
  const tasks = new Map(
    (taskIds.length
      ? all<{ id: string; status: string; project_title: string | null }>(
          `SELECT t.id, t.status, p.title AS project_title
           FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
           WHERE t.archived = 0 AND t.id IN (${holes(taskIds)})`,
          ...taskIds,
        )
      : []
    ).map((row) => [row.id, row]),
  );

  const projectIds = idsOf("project");
  const projects = new Map(
    (projectIds.length
      ? all<{ id: string; status: string }>(
          `SELECT id, status FROM projects
           WHERE archived = 0 AND id IN (${holes(projectIds)})`,
          ...projectIds,
        )
      : []
    ).map((row) => [row.id, row]),
  );

  const hits: SearchHit[] = [];
  for (const row of rows) {
    const base = { kind: row.kind, id: row.ref_id, title: row.title, snippet: bestSnippet(row) };
    if (row.kind === "note") {
      const note = notes.get(row.ref_id);
      if (!note) continue;
      hits.push({ ...base, icon: note.icon, context: note.parent_title, href: `/notes/${row.ref_id}` });
    } else if (row.kind === "task") {
      const task = tasks.get(row.ref_id);
      if (!task) continue;
      hits.push({
        ...base,
        icon: null,
        context: task.project_title ?? STATUS_LABEL[task.status as TaskStatus] ?? null,
        href: `/tasks/${row.ref_id}`,
      });
    } else {
      const project = projects.get(row.ref_id);
      if (!project) continue;
      hits.push({ ...base, icon: null, context: project.status, href: `/tasks?project=${row.ref_id}` });
    }
  }
  return hits;
}

/** The grouped shape the search page and the data-layer tests expect. */
export function search(q: string, today = todayISO()) {
  const hits = searchAll(q, 120);
  const pick = (kind: SearchKind) => hits.filter((hit) => hit.kind === kind).map((hit) => hit.id);
  return {
    tasks: pick("task").map((id) => getTask(id, today)).filter(Boolean) as TaskView[],
    notes: pick("note").map((id) => getNote(id)).filter(Boolean) as NoteView[],
    projects: pick("project").map((id) => getProject(id)).filter(Boolean) as ProjectView[],
  };
}
