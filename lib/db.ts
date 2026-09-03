import "server-only";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";

const DB_PATH = process.env.GROWLY_DB ?? path.join(process.cwd(), "data", "growly.db");

const SCHEMA = fs.readFileSync(path.join(process.cwd(), "lib", "schema.sql"), "utf8");


const DEFAULT_SETTINGS: Record<string, string> = {
  // The grid runs the whole day; narrow it in Settings if you'd rather not see
  // the small hours. 1439 rather than 1440 so it round-trips an <input type="time">.
  accent: "green",
  day_start_min: "0",
  day_end_min: "1439",
  daily_capacity_min: "360",
  week_starts_on: "1",
};

/** Columns added after the first release. `CREATE TABLE IF NOT EXISTS` skips an
    existing table, so older databases need them bolted on one by one. */
const ADDED_COLUMNS: { table: string; column: string; definition: string }[] = [
  { table: "notes", column: "parent_id", definition: "TEXT REFERENCES notes(id) ON DELETE CASCADE" },
  { table: "notes", column: "icon", definition: "TEXT" },
  { table: "notes", column: "cover", definition: "TEXT" },
  { table: "notes", column: "position", definition: "INTEGER NOT NULL DEFAULT 0" },
];

/** Bump to have every row re-indexed, e.g. after a tokenizer change. */
const SEARCH_INDEX_VERSION = "2";

function migrate(db: DatabaseSync) {
  for (const { table, column, definition } of ADDED_COLUMNS) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (columns.some((c) => c.name === column)) continue;
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_notes_parent ON notes(parent_id)");

  // Triggers only catch rows written from now on; anything already in the
  // database has to be swept in once.
  const stamp = db
    .prepare("SELECT value FROM settings WHERE key = 'search_index_version'")
    .get() as { value?: string } | undefined;
  if (stamp?.value === SEARCH_INDEX_VERSION) return;

  // A version bump can change the table's columns, so rebuild it from the
  // schema rather than trying to patch a virtual table in place.
  db.exec("DROP TABLE IF EXISTS search_index");
  db.exec(SCHEMA);
  const folded = (title: string, body: string) =>
    `replace(replace(${title} || ' ' || ${body}, 'đ', 'd'), 'Đ', 'D')`;
  db.exec(`
    INSERT INTO search_index(kind, ref_id, title, body, fold)
      SELECT 'note', id, title, content, ${folded("title", "content")} FROM notes;
    INSERT INTO search_index(kind, ref_id, title, body, fold)
      SELECT 'task', id, title, COALESCE(notes, ''),
             ${folded("title", "COALESCE(notes, '')")} FROM tasks;
    INSERT INTO search_index(kind, ref_id, title, body, fold)
      SELECT 'project', id, title, COALESCE(description, ''),
             ${folded("title", "COALESCE(description, '')")} FROM projects;
    INSERT INTO search_index(kind, ref_id, title, body, fold)
      SELECT 'goal', id, title, COALESCE(description, ''),
             ${folded("title", "COALESCE(description, '')")} FROM goals;
  `);
  db.prepare("INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)").run(
    "search_index_version",
    SEARCH_INDEX_VERSION,
  );
}

function connect(): DatabaseSync {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH, { timeout: 5000 });
  try {
    // WAL needs a brief exclusive lock; a parallel process may already hold it.
    db.exec("PRAGMA journal_mode = WAL;");
  } catch {
    // Another connection already set the journal mode — keep going.
  }
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  migrate(db);

  const now = new Date().toISOString();
  const setting = db.prepare("INSERT OR IGNORE INTO settings(key, value) VALUES(?, ?)");
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) setting.run(key, value);

  const areaCount = db.prepare("SELECT COUNT(*) AS n FROM areas").get() as { n: number };
  if (areaCount.n === 0) {
    const insert = db.prepare(
      "INSERT INTO areas(id, name, color, position, created_at) VALUES(?, ?, ?, ?, ?)",
    );
    [
      ["Work", "indigo"],
      ["Health", "emerald"],
      ["Learning", "amber"],
      ["Personal", "rose"],
    ].forEach(([name, color], i) => insert.run(`area_${name.toLowerCase()}`, name, color, i, now));
  }
  return db;
}

const globalForDb = globalThis as unknown as { __growlyDb?: DatabaseSync };

/** Opened on first query, not at import time, so builds and workers stay lock-free. */
export function db(): DatabaseSync {
  if (!globalForDb.__growlyDb) globalForDb.__growlyDb = connect();
  return globalForDb.__growlyDb;
}

/** Runs a set of statements inside a transaction. */
export function tx<T>(fn: () => T): T {
  const conn = db();
  conn.exec("BEGIN");
  try {
    const out = fn();
    conn.exec("COMMIT");
    return out;
  } catch (err) {
    conn.exec("ROLLBACK");
    throw err;
  }
}

type Params = unknown[] | [Record<string, unknown>];

/** node:sqlite returns null-prototype rows; copy them so React can serialize them. */
export function all<T>(sql: string, ...params: Params): T[] {
  return (db().prepare(sql).all(...(params as never[])) as object[]).map((r) => ({ ...r }) as T);
}

export function get<T>(sql: string, ...params: Params): T | undefined {
  const row = db().prepare(sql).get(...(params as never[])) as object | undefined;
  return row ? ({ ...row } as T) : undefined;
}

export function run(sql: string, ...params: Params) {
  return db().prepare(sql).run(...(params as never[]));
}
