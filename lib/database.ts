"use server";

import { revalidatePath } from "next/cache";
import { all, get, run, tx } from "./db";
import { newId, nowISO } from "./util";
import type {
  CellValue, DatabaseData, DatabaseRow, Filter, NoteDatabase, Property, PropertyType, Sort,
  ViewKind,
} from "./db-schema";

interface DatabaseRecord {
  id: string;
  note_id: string | null;
  title: string;
  properties: string;
  view: string;
  group_by: string | null;
  date_prop: string | null;
  filters: string;
  sorts: string;
}

interface RowRecord {
  id: string;
  position: number;
  values_json: string;
  created_at: string;
  updated_at: string;
}

/** JSON columns are written by this app, but a hand-edited file should not crash it. */
function parseJson<T>(raw: string, fallback: T): T {
  try {
    const value = JSON.parse(raw);
    return value == null ? fallback : (value as T);
  } catch {
    return fallback;
  }
}

function hydrate(record: DatabaseRecord): NoteDatabase {
  return {
    id: record.id,
    note_id: record.note_id,
    title: record.title,
    properties: parseJson<Property[]>(record.properties, []),
    view: (record.view as ViewKind) ?? "table",
    group_by: record.group_by,
    date_prop: record.date_prop,
    filters: parseJson<Filter[]>(record.filters, []),
    sorts: parseJson<Sort[]>(record.sorts, []),
  };
}

function touch(id: string) {
  run("UPDATE databases SET updated_at = ? WHERE id = ?", nowISO(), id);
  revalidatePath("/", "layout");
}

/* ------------------------------------------------------------------ reads -- */

export async function getDatabase(id: string): Promise<DatabaseData | null> {
  const record = get<DatabaseRecord>("SELECT * FROM databases WHERE id = ?", id);
  if (!record) return null;
  const rows = all<RowRecord>(
    "SELECT id, position, values_json, created_at, updated_at FROM database_rows WHERE database_id = ? ORDER BY position, created_at",
    id,
  );
  return {
    database: hydrate(record),
    rows: rows.map((row) => ({
      id: row.id,
      position: row.position,
      values: parseJson<Record<string, CellValue>>(row.values_json, {}),
      created_at: row.created_at,
      updated_at: row.updated_at,
    })),
  };
}

/* ----------------------------------------------------------------- writes -- */

/** A new database starts with the columns most tables actually need. */
export async function createDatabase(noteId: string, title = "Untitled database"): Promise<string> {
  const id = newId();
  const now = nowISO();
  const properties: Property[] = [
    { id: newId(), name: "Name", type: "text" },
    {
      id: newId(),
      name: "Status",
      type: "select",
      options: [
        { id: newId(), name: "Not started", color: "slate" },
        { id: newId(), name: "In progress", color: "amber" },
        { id: newId(), name: "Done", color: "emerald" },
      ],
    },
    { id: newId(), name: "Date", type: "date" },
  ];

  tx(() => {
    run(
      `INSERT INTO databases(id, note_id, title, properties, view, group_by, date_prop,
         filters, sorts, created_at, updated_at)
       VALUES(?, ?, ?, ?, 'table', ?, ?, '[]', '[]', ?, ?)`,
      id,
      noteId,
      title,
      JSON.stringify(properties),
      properties[1].id,
      properties[2].id,
      now,
      now,
    );
    const insert = "INSERT INTO database_rows(id, database_id, position, values_json, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?)";
    for (let i = 0; i < 3; i += 1) {
      run(insert, newId(), id, i, JSON.stringify({ [properties[0].id]: "" }), now, now);
    }
  });
  revalidatePath("/", "layout");
  return id;
}

export async function renameDatabase(id: string, title: string): Promise<void> {
  run("UPDATE databases SET title = ? WHERE id = ?", title.trim() || "Untitled database", id);
  touch(id);
}

export async function setDatabaseView(
  id: string,
  patch: { view?: ViewKind; group_by?: string | null; date_prop?: string | null },
): Promise<void> {
  const sets: string[] = [];
  const values: unknown[] = [];
  if (patch.view) {
    sets.push("view = ?");
    values.push(patch.view);
  }
  if ("group_by" in patch) {
    sets.push("group_by = ?");
    values.push(patch.group_by ?? null);
  }
  if ("date_prop" in patch) {
    sets.push("date_prop = ?");
    values.push(patch.date_prop ?? null);
  }
  if (!sets.length) return;
  run(`UPDATE databases SET ${sets.join(", ")} WHERE id = ?`, ...values, id);
  touch(id);
}

export async function setDatabaseProperties(id: string, properties: Property[]): Promise<void> {
  run("UPDATE databases SET properties = ? WHERE id = ?", JSON.stringify(properties), id);
  touch(id);
}

export async function setDatabaseRules(
  id: string,
  rules: { filters?: Filter[]; sorts?: Sort[] },
): Promise<void> {
  const sets: string[] = [];
  const values: unknown[] = [];
  if (rules.filters) {
    sets.push("filters = ?");
    values.push(JSON.stringify(rules.filters));
  }
  if (rules.sorts) {
    sets.push("sorts = ?");
    values.push(JSON.stringify(rules.sorts));
  }
  if (!sets.length) return;
  run(`UPDATE databases SET ${sets.join(", ")} WHERE id = ?`, ...values, id);
  touch(id);
}

/** Drop a property from the schema and from every row that carried a value. */
export async function deleteProperty(id: string, propertyId: string): Promise<void> {
  const record = get<DatabaseRecord>("SELECT * FROM databases WHERE id = ?", id);
  if (!record) return;
  const database = hydrate(record);

  tx(() => {
    run(
      "UPDATE databases SET properties = ?, group_by = ?, date_prop = ?, filters = ?, sorts = ? WHERE id = ?",
      JSON.stringify(database.properties.filter((property) => property.id !== propertyId)),
      database.group_by === propertyId ? null : database.group_by,
      database.date_prop === propertyId ? null : database.date_prop,
      JSON.stringify(database.filters.filter((filter) => filter.property !== propertyId)),
      JSON.stringify(database.sorts.filter((sort) => sort.property !== propertyId)),
      id,
    );
    for (const row of all<RowRecord>(
      "SELECT id, position, values_json, created_at, updated_at FROM database_rows WHERE database_id = ?",
      id,
    )) {
      const values = parseJson<Record<string, CellValue>>(row.values_json, {});
      if (!(propertyId in values)) continue;
      delete values[propertyId];
      run("UPDATE database_rows SET values_json = ? WHERE id = ?", JSON.stringify(values), row.id);
    }
  });
  touch(id);
}

export async function addRow(
  id: string,
  values: Record<string, CellValue> = {},
): Promise<DatabaseRow | null> {
  const exists = get<{ id: string }>("SELECT id FROM databases WHERE id = ?", id);
  if (!exists) return null;
  const rowId = newId();
  const now = nowISO();
  const next = get<{ next: number }>(
    "SELECT COALESCE(MAX(position), -1) + 1 AS next FROM database_rows WHERE database_id = ?",
    id,
  );
  run(
    "INSERT INTO database_rows(id, database_id, position, values_json, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?)",
    rowId,
    id,
    next?.next ?? 0,
    JSON.stringify(values),
    now,
    now,
  );
  touch(id);
  return { id: rowId, position: next?.next ?? 0, values, created_at: now, updated_at: now };
}

export async function updateRow(
  databaseId: string,
  rowId: string,
  values: Record<string, CellValue>,
): Promise<void> {
  run(
    "UPDATE database_rows SET values_json = ?, updated_at = ? WHERE id = ? AND database_id = ?",
    JSON.stringify(values),
    nowISO(),
    rowId,
    databaseId,
  );
  touch(databaseId);
}

export async function deleteRow(databaseId: string, rowId: string): Promise<void> {
  run("DELETE FROM database_rows WHERE id = ? AND database_id = ?", rowId, databaseId);
  touch(databaseId);
}

export async function reorderRows(databaseId: string, orderedIds: string[]): Promise<void> {
  tx(() => {
    orderedIds.forEach((rowId, index) =>
      run(
        "UPDATE database_rows SET position = ? WHERE id = ? AND database_id = ?",
        index,
        rowId,
        databaseId,
      ),
    );
  });
  touch(databaseId);
}

/** Property types are what turn a table into a database; changing one keeps the
 *  old text around by leaving values untouched where they still make sense. */
export async function addProperty(
  id: string,
  name: string,
  type: PropertyType,
): Promise<Property | null> {
  const record = get<DatabaseRecord>("SELECT properties FROM databases WHERE id = ?", id);
  if (!record) return null;
  const properties = parseJson<Property[]>(record.properties, []);
  const property: Property = {
    id: newId(),
    name: name.trim() || "Property",
    type,
    ...(type === "select" || type === "multi_select" ? { options: [] } : {}),
  };
  properties.push(property);
  run("UPDATE databases SET properties = ? WHERE id = ?", JSON.stringify(properties), id);
  touch(id);
  return property;
}
