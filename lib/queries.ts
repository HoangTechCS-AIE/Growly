import "server-only";
import { all, get } from "./db";
import type {
  Area, GoalView, Milestone, Note, NoteView, ProjectView, Reflection, ReviewRecord,
  Settings, Strategy, Tag, Task, TaskEvent, TaskStatus, TaskView, TimeLog, Vision,
} from "./types";
import { addDaysISO, todayISO } from "./util";

/* ------------------------------------------------------------------ settings */

export function getSettings(): Settings {
  const rows = all<{ key: string; value: string }>("SELECT key, value FROM settings");
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    day_start_min: Number(map.day_start_min ?? 480),
    day_end_min: Number(map.day_end_min ?? 1320),
    daily_capacity_min: Number(map.daily_capacity_min ?? 360),
    week_starts_on: Number(map.week_starts_on ?? 1),
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

/* ------------------------------------------------------------------ strategy */

export function listVisions(): Vision[] {
  return all<Vision>("SELECT * FROM visions WHERE archived = 0 ORDER BY position, created_at");
}

const GOAL_SELECT = `
  SELECT g.*,
    v.title AS vision_title,
    a.name  AS area_name,
    a.color AS area_color,
    (SELECT COUNT(*) FROM tasks t
       LEFT JOIN projects p ON p.id = t.project_id
       LEFT JOIN strategies s ON s.id = p.strategy_id
       WHERE COALESCE(t.goal_id, p.goal_id, s.goal_id) = g.id AND t.archived = 0) AS task_total,
    (SELECT COUNT(*) FROM tasks t
       LEFT JOIN projects p ON p.id = t.project_id
       LEFT JOIN strategies s ON s.id = p.strategy_id
       WHERE COALESCE(t.goal_id, p.goal_id, s.goal_id) = g.id AND t.archived = 0
         AND t.status = 'done') AS task_done,
    (SELECT COUNT(*) FROM projects p2
       LEFT JOIN strategies s2 ON s2.id = p2.strategy_id
       WHERE COALESCE(p2.goal_id, s2.goal_id) = g.id AND p2.archived = 0) AS project_total,
    (SELECT COALESCE(SUM(l.minutes), 0) FROM time_logs l
       JOIN tasks t ON t.id = l.task_id
       LEFT JOIN projects p ON p.id = t.project_id
       LEFT JOIN strategies s ON s.id = p.strategy_id
       WHERE COALESCE(t.goal_id, p.goal_id, s.goal_id) = g.id) AS minutes_logged
  FROM goals g
  LEFT JOIN visions v ON v.id = g.vision_id
  LEFT JOIN areas a   ON a.id = g.area_id`;

export function listGoals(opts: { status?: string; visionId?: string } = {}): GoalView[] {
  const where = ["g.archived = 0"];
  const params: unknown[] = [];
  if (opts.status) {
    where.push("g.status = ?");
    params.push(opts.status);
  }
  if (opts.visionId) {
    where.push("g.vision_id = ?");
    params.push(opts.visionId);
  }
  return all<GoalView>(
    `${GOAL_SELECT} WHERE ${where.join(" AND ")} ORDER BY g.position, g.created_at`,
    ...params,
  );
}

export function getGoal(id: string): GoalView | undefined {
  return get<GoalView>(`${GOAL_SELECT} WHERE g.id = ?`, id);
}

export function listStrategies(goalId?: string): Strategy[] {
  if (goalId) {
    return all<Strategy>(
      "SELECT * FROM strategies WHERE archived = 0 AND goal_id = ? ORDER BY position, start_date",
      goalId,
    );
  }
  return all<Strategy>("SELECT * FROM strategies WHERE archived = 0 ORDER BY position, start_date");
}

const PROJECT_SELECT = `
  SELECT p.*,
    g.title AS goal_title,
    s.title AS strategy_title,
    (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.archived = 0) AS task_total,
    (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.archived = 0
       AND t.status = 'done') AS task_done,
    (SELECT MAX(t.updated_at) FROM tasks t WHERE t.project_id = p.id) AS last_activity
  FROM projects p
  LEFT JOIN strategies s ON s.id = p.strategy_id
  LEFT JOIN goals g ON g.id = COALESCE(p.goal_id, s.goal_id)`;

export function listProjects(opts: { goalId?: string; strategyId?: string; status?: string } = {}): ProjectView[] {
  const where = ["p.archived = 0"];
  const params: unknown[] = [];
  if (opts.goalId) {
    where.push("COALESCE(p.goal_id, s.goal_id) = ?");
    params.push(opts.goalId);
  }
  if (opts.strategyId) {
    where.push("p.strategy_id = ?");
    params.push(opts.strategyId);
  }
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
    g.id    AS effective_goal_id,
    g.title AS goal_title,
    a.name  AS area_name,
    a.color AS area_color,
    (SELECT COUNT(*) FROM tasks st WHERE st.parent_id = t.id AND st.archived = 0) AS subtask_total,
    (SELECT COUNT(*) FROM tasks st WHERE st.parent_id = t.id AND st.archived = 0
       AND st.status = 'done') AS subtask_done,
    (SELECT COUNT(*) FROM task_deps d JOIN tasks dt ON dt.id = d.depends_on_id
       WHERE d.task_id = t.id AND dt.status <> 'done') AS blocked_by,
    (SELECT COUNT(*) FROM day_focus f WHERE f.task_id = t.id AND f.date = ?) AS is_focus
  FROM tasks t
  LEFT JOIN projects p   ON p.id = t.project_id
  LEFT JOIN strategies s ON s.id = p.strategy_id
  LEFT JOIN goals g      ON g.id = COALESCE(t.goal_id, p.goal_id, s.goal_id)
  LEFT JOIN areas a      ON a.id = COALESCE(t.area_id, p.area_id, g.area_id)`;

export interface TaskFilter {
  status?: TaskStatus[];
  goalId?: string;
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
  if (f.goalId) {
    where.push("g.id = ?");
    params.push(f.goalId);
  }
  if (f.projectId) {
    where.push("t.project_id = ?");
    params.push(f.projectId);
  }
  if (f.areaId) {
    where.push("COALESCE(t.area_id, p.area_id, g.area_id) = ?");
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
  SELECT n.*, p.title AS project_title, g.title AS goal_title
  FROM notes n
  LEFT JOIN projects p ON p.id = n.project_id
  LEFT JOIN goals g ON g.id = n.goal_id`;

export interface NoteFilter {
  kind?: string;
  search?: string;
  tagId?: string;
  projectId?: string;
  goalId?: string;
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
  if (f.goalId) {
    where.push("n.goal_id = ?");
    params.push(f.goalId);
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

/** Share of the period's work that ladders up to a long-term goal. */
export function alignmentScore(from: string, to: string) {
  const row = get<{ total: number; aligned: number }>(
    `SELECT COUNT(*) AS total,
       SUM(CASE WHEN COALESCE(t.goal_id, p.goal_id, s.goal_id) IS NOT NULL THEN 1 ELSE 0 END) AS aligned
     FROM tasks t
     LEFT JOIN projects p ON p.id = t.project_id
     LEFT JOIN strategies s ON s.id = p.strategy_id
     WHERE t.archived = 0
       AND ((t.scheduled_date BETWEEN ? AND ?)
            OR (DATE(t.completed_at) BETWEEN ? AND ?))`,
    from,
    to,
    from,
    to,
  );
  const total = row?.total ?? 0;
  const aligned = row?.aligned ?? 0;
  return { total, aligned, score: total ? Math.round((aligned / total) * 100) : 0 };
}

export function timePerGoal(from: string, to: string) {
  return all<{ goal_id: string | null; goal_title: string | null; minutes: number }>(
    `SELECT COALESCE(t.goal_id, p.goal_id, s.goal_id) AS goal_id,
            g.title AS goal_title,
            SUM(l.minutes) AS minutes
     FROM time_logs l
     JOIN tasks t ON t.id = l.task_id
     LEFT JOIN projects p ON p.id = t.project_id
     LEFT JOIN strategies s ON s.id = p.strategy_id
     LEFT JOIN goals g ON g.id = COALESCE(t.goal_id, p.goal_id, s.goal_id)
     WHERE l.date BETWEEN ? AND ?
     GROUP BY 1, 2
     ORDER BY minutes DESC`,
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
  const idleGoals = all<GoalView>(
    `${GOAL_SELECT}
     WHERE g.archived = 0 AND g.status = 'active'
       AND NOT EXISTS (
         SELECT 1 FROM tasks t
         LEFT JOIN projects p ON p.id = t.project_id
         LEFT JOIN strategies s ON s.id = p.strategy_id
         WHERE COALESCE(t.goal_id, p.goal_id, s.goal_id) = g.id
           AND t.status = 'done' AND DATE(t.completed_at) >= ?)
     ORDER BY g.position`,
    staleDate,
  );
  return { postponed, staleProjects, idleGoals };
}

export function getReview(kind: string, periodKey: string): ReviewRecord | undefined {
  const row = get<Omit<ReviewRecord, "data"> & { data: string }>(
    "SELECT * FROM reviews WHERE kind = ? AND period_key = ?",
    kind,
    periodKey,
  );
  if (!row) return undefined;
  return { ...row, data: JSON.parse(row.data) as Record<string, string> } as ReviewRecord;
}

export function listReviews(kind: string, limit = 10): ReviewRecord[] {
  return all<Omit<ReviewRecord, "data"> & { data: string }>(
    "SELECT * FROM reviews WHERE kind = ? ORDER BY period_key DESC LIMIT ?",
    kind,
    limit,
  ).map((r) => ({ ...r, data: JSON.parse(r.data) as Record<string, string> }) as ReviewRecord);
}

export function search(q: string, today = todayISO()) {
  if (!q.trim()) return { tasks: [], notes: [], projects: [], goals: [] };
  const like = `%${q.trim()}%`;
  return {
    tasks: listTasks({ search: q.trim(), includeDone: true, limit: 25 }, today),
    notes: listNotes({ search: q.trim(), limit: 25 }),
    projects: all<ProjectView>(
      `${PROJECT_SELECT} WHERE p.title LIKE ? OR p.description LIKE ? LIMIT 10`,
      like,
      like,
    ),
    goals: all<GoalView>(
      `${GOAL_SELECT} WHERE g.title LIKE ? OR g.description LIKE ? LIMIT 10`,
      like,
      like,
    ),
  };
}
