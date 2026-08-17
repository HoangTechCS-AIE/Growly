import "server-only";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";

const DB_PATH = process.env.GROWLY_DB ?? path.join(process.cwd(), "data", "growly.db");

const SCHEMA = fs.readFileSync(path.join(process.cwd(), "lib", "schema.sql"), "utf8");


const DEFAULT_SETTINGS: Record<string, string> = {
  day_start_min: "480",
  day_end_min: "1320",
  daily_capacity_min: "360",
  week_starts_on: "1",
};

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
