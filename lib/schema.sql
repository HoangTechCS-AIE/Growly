CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS areas (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT 'slate',
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS visions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  horizon TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  vision_id TEXT REFERENCES visions(id) ON DELETE SET NULL,
  area_id   TEXT REFERENCES areas(id)   ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  metric TEXT,
  start_date TEXT,
  target_date TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  position INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS strategies (
  id TEXT PRIMARY KEY,
  goal_id TEXT REFERENCES goals(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  start_date TEXT,
  end_date TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  position INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  strategy_id TEXT REFERENCES strategies(id) ON DELETE SET NULL,
  goal_id     TEXT REFERENCES goals(id)      ON DELETE SET NULL,
  area_id     TEXT REFERENCES areas(id)      ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  start_date TEXT,
  due_date TEXT,
  color TEXT NOT NULL DEFAULT 'indigo',
  position INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS milestones (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  date TEXT,
  done INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  notes TEXT,
  short_term_outcome TEXT,
  long_term_contribution TEXT,
  next_action TEXT,
  goal_id    TEXT REFERENCES goals(id)    ON DELETE SET NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  area_id    TEXT REFERENCES areas(id)    ON DELETE SET NULL,
  parent_id  TEXT REFERENCES tasks(id)    ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'inbox',
  important INTEGER NOT NULL DEFAULT 0,
  urgent    INTEGER NOT NULL DEFAULT 0,
  estimate_minutes INTEGER,
  due_date TEXT,
  scheduled_date TEXT,
  start_min INTEGER,
  end_min INTEGER,
  waiting_on TEXT,
  recurrence TEXT,
  recurrence_until TEXT,
  series_id TEXT,
  completed_at TEXT,
  postponed_count INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_status    ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_scheduled ON tasks(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_tasks_due       ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_project   ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_goal      ON tasks(goal_id);
CREATE INDEX IF NOT EXISTS idx_tasks_parent    ON tasks(parent_id);

CREATE TABLE IF NOT EXISTS task_deps (
  task_id       TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, depends_on_id)
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  color TEXT NOT NULL DEFAULT 'slate',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS task_tags (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  tag_id  TEXT NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
  PRIMARY KEY (task_id, tag_id)
);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'quick',
  date TEXT,
  parent_id TEXT REFERENCES notes(id) ON DELETE CASCADE,
  icon TEXT,
  cover TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  goal_id    TEXT REFERENCES goals(id)    ON DELETE SET NULL,
  task_id    TEXT REFERENCES tasks(id)    ON DELETE SET NULL,
  pinned   INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notes_kind   ON notes(kind);
CREATE INDEX IF NOT EXISTS idx_notes_date   ON notes(date);

CREATE TABLE IF NOT EXISTS note_tags (
  note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  tag_id  TEXT NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
  PRIMARY KEY (note_id, tag_id)
);

CREATE TABLE IF NOT EXISTS note_links (
  from_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  to_id   TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  PRIMARY KEY (from_id, to_id)
);

CREATE TABLE IF NOT EXISTS time_logs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  minutes INTEGER NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_time_logs_date ON time_logs(date);

CREATE TABLE IF NOT EXISTS task_events (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_task_events_task ON task_events(task_id);

CREATE TABLE IF NOT EXISTS task_reflections (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  met_expectation TEXT,
  contributed TEXT,
  next_step TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS day_focus (
  date TEXT NOT NULL,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date, task_id)
);

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  period_key TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (kind, period_key)
);

/* ---------------------------------------------------------------- databases --
   A Notion-style database lives inside a note as a `::db id=…` block. Property
   definitions and row values are JSON: they are read and written whole, and a
   typed column per property would mean a migration every time one is added. */

CREATE TABLE IF NOT EXISTS databases (
  id TEXT PRIMARY KEY,
  note_id TEXT REFERENCES notes(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Untitled database',
  properties TEXT NOT NULL DEFAULT '[]',
  view TEXT NOT NULL DEFAULT 'table',
  group_by TEXT,
  date_prop TEXT,
  filters TEXT NOT NULL DEFAULT '[]',
  sorts TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_databases_note ON databases(note_id);

CREATE TABLE IF NOT EXISTS database_rows (
  id TEXT PRIMARY KEY,
  database_id TEXT NOT NULL REFERENCES databases(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  values_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_database_rows_db ON database_rows(database_id);

/* ------------------------------------------------------------ search index --
   One FTS5 table covers notes, tasks, projects and goals so a single query can
   rank across all of them. `remove_diacritics 2` folds Vietnamese tone marks,
   but not "đ", which Unicode treats as its own letter rather than d + a mark —
   hence the extra `fold` column holding a đ→d copy of the text. Matching hits
   it too, while snippets still come from the untouched title and body. */

CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
  kind UNINDEXED,
  ref_id UNINDEXED,
  title,
  body,
  fold,
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TRIGGER IF NOT EXISTS notes_search_ai AFTER INSERT ON notes BEGIN
  INSERT INTO search_index(kind, ref_id, title, body, fold)
  VALUES('note', new.id, new.title, new.content,
         replace(replace(new.title || ' ' || new.content, 'đ', 'd'), 'Đ', 'D'));
END;
CREATE TRIGGER IF NOT EXISTS notes_search_au AFTER UPDATE ON notes BEGIN
  DELETE FROM search_index WHERE kind = 'note' AND ref_id = old.id;
  INSERT INTO search_index(kind, ref_id, title, body, fold)
  VALUES('note', new.id, new.title, new.content,
         replace(replace(new.title || ' ' || new.content, 'đ', 'd'), 'Đ', 'D'));
END;
CREATE TRIGGER IF NOT EXISTS notes_search_ad AFTER DELETE ON notes BEGIN
  DELETE FROM search_index WHERE kind = 'note' AND ref_id = old.id;
END;

CREATE TRIGGER IF NOT EXISTS tasks_search_ai AFTER INSERT ON tasks BEGIN
  INSERT INTO search_index(kind, ref_id, title, body, fold)
  VALUES('task', new.id, new.title, COALESCE(new.notes, ''),
         replace(replace(new.title || ' ' || COALESCE(new.notes, ''), 'đ', 'd'), 'Đ', 'D'));
END;
CREATE TRIGGER IF NOT EXISTS tasks_search_au AFTER UPDATE ON tasks BEGIN
  DELETE FROM search_index WHERE kind = 'task' AND ref_id = old.id;
  INSERT INTO search_index(kind, ref_id, title, body, fold)
  VALUES('task', new.id, new.title, COALESCE(new.notes, ''),
         replace(replace(new.title || ' ' || COALESCE(new.notes, ''), 'đ', 'd'), 'Đ', 'D'));
END;
CREATE TRIGGER IF NOT EXISTS tasks_search_ad AFTER DELETE ON tasks BEGIN
  DELETE FROM search_index WHERE kind = 'task' AND ref_id = old.id;
END;

CREATE TRIGGER IF NOT EXISTS projects_search_ai AFTER INSERT ON projects BEGIN
  INSERT INTO search_index(kind, ref_id, title, body, fold)
  VALUES('project', new.id, new.title, COALESCE(new.description, ''),
         replace(replace(new.title || ' ' || COALESCE(new.description, ''), 'đ', 'd'), 'Đ', 'D'));
END;
CREATE TRIGGER IF NOT EXISTS projects_search_au AFTER UPDATE ON projects BEGIN
  DELETE FROM search_index WHERE kind = 'project' AND ref_id = old.id;
  INSERT INTO search_index(kind, ref_id, title, body, fold)
  VALUES('project', new.id, new.title, COALESCE(new.description, ''),
         replace(replace(new.title || ' ' || COALESCE(new.description, ''), 'đ', 'd'), 'Đ', 'D'));
END;
CREATE TRIGGER IF NOT EXISTS projects_search_ad AFTER DELETE ON projects BEGIN
  DELETE FROM search_index WHERE kind = 'project' AND ref_id = old.id;
END;

CREATE TRIGGER IF NOT EXISTS goals_search_ai AFTER INSERT ON goals BEGIN
  INSERT INTO search_index(kind, ref_id, title, body, fold)
  VALUES('goal', new.id, new.title, COALESCE(new.description, ''),
         replace(replace(new.title || ' ' || COALESCE(new.description, ''), 'đ', 'd'), 'Đ', 'D'));
END;
CREATE TRIGGER IF NOT EXISTS goals_search_au AFTER UPDATE ON goals BEGIN
  DELETE FROM search_index WHERE kind = 'goal' AND ref_id = old.id;
  INSERT INTO search_index(kind, ref_id, title, body, fold)
  VALUES('goal', new.id, new.title, COALESCE(new.description, ''),
         replace(replace(new.title || ' ' || COALESCE(new.description, ''), 'đ', 'd'), 'Đ', 'D'));
END;
CREATE TRIGGER IF NOT EXISTS goals_search_ad AFTER DELETE ON goals BEGIN
  DELETE FROM search_index WHERE kind = 'goal' AND ref_id = old.id;
END;
