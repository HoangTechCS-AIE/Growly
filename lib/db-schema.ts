/** Shape of a note database, plus the pure helpers both sides need.
 *
 *  Kept free of any server import so the table, board and calendar views can
 *  filter and sort in the browser without a round trip.
 */

export type PropertyType =
  | "text"
  | "number"
  | "select"
  | "multi_select"
  | "date"
  | "checkbox"
  | "person"
  | "url";

export const PROPERTY_LABEL: Record<PropertyType, string> = {
  text: "Text",
  number: "Number",
  select: "Select",
  multi_select: "Multi-select",
  date: "Date",
  checkbox: "Checkbox",
  person: "Person",
  url: "URL",
};

export const OPTION_COLORS = [
  "indigo", "emerald", "amber", "rose", "sky", "violet", "teal", "orange", "slate",
] as const;

export interface SelectOption {
  id: string;
  name: string;
  color: string;
}

export interface Property {
  id: string;
  name: string;
  type: PropertyType;
  options?: SelectOption[];
}

export type CellValue = string | number | boolean | string[] | null;

export interface DatabaseRow {
  id: string;
  position: number;
  values: Record<string, CellValue>;
  created_at: string;
  updated_at: string;
}

export type ViewKind = "table" | "board" | "calendar";

export type FilterOperator =
  | "contains"
  | "is"
  | "is_not"
  | "gt"
  | "lt"
  | "before"
  | "after"
  | "checked"
  | "unchecked"
  | "empty"
  | "not_empty";

export interface Filter {
  id: string;
  property: string;
  operator: FilterOperator;
  value: string;
}

export interface Sort {
  id: string;
  property: string;
  direction: "asc" | "desc";
}

export interface NoteDatabase {
  id: string;
  note_id: string | null;
  title: string;
  properties: Property[];
  view: ViewKind;
  group_by: string | null;
  date_prop: string | null;
  filters: Filter[];
  sorts: Sort[];
}

export interface DatabaseData {
  database: NoteDatabase;
  rows: DatabaseRow[];
}

/* --------------------------------------------------------------- defaults -- */

export const OPERATOR_LABEL: Record<FilterOperator, string> = {
  contains: "contains",
  is: "is",
  is_not: "is not",
  gt: "greater than",
  lt: "less than",
  before: "before",
  after: "after",
  checked: "is checked",
  unchecked: "is unchecked",
  empty: "is empty",
  not_empty: "is not empty",
};

export function operatorsFor(type: PropertyType): FilterOperator[] {
  switch (type) {
    case "number":
      return ["is", "gt", "lt", "empty", "not_empty"];
    case "select":
    case "multi_select":
      return ["is", "is_not", "empty", "not_empty"];
    case "date":
      return ["is", "before", "after", "empty", "not_empty"];
    case "checkbox":
      return ["checked", "unchecked"];
    default:
      return ["contains", "is", "is_not", "empty", "not_empty"];
  }
}

export function emptyValue(type: PropertyType): CellValue {
  if (type === "checkbox") return false;
  if (type === "multi_select") return [];
  if (type === "number") return null;
  return "";
}

/** Everything a filter, a sort or a board column compares is text or a number. */
export function asText(value: CellValue, property: Property): string {
  if (value == null) return "";
  if (Array.isArray(value)) {
    return value
      .map((id) => property.options?.find((option) => option.id === id)?.name ?? id)
      .join(", ");
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (property.type === "select") {
    return property.options?.find((option) => option.id === value)?.name ?? String(value);
  }
  return String(value);
}

function isEmptyValue(value: CellValue): boolean {
  if (value == null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "boolean") return false;
  return String(value).trim() === "";
}

export function matchesFilter(row: DatabaseRow, filter: Filter, properties: Property[]): boolean {
  const property = properties.find((item) => item.id === filter.property);
  if (!property) return true;
  const raw = row.values[property.id] ?? emptyValue(property.type);

  switch (filter.operator) {
    case "empty":
      return isEmptyValue(raw);
    case "not_empty":
      return !isEmptyValue(raw);
    case "checked":
      return raw === true;
    case "unchecked":
      return raw !== true;
    case "gt":
      return Number(raw) > Number(filter.value);
    case "lt":
      return Number(raw) < Number(filter.value);
    case "before":
      return Boolean(raw) && String(raw) < filter.value;
    case "after":
      return Boolean(raw) && String(raw) > filter.value;
    case "is_not":
      return !valueIs(raw, filter.value, property);
    case "is":
      return valueIs(raw, filter.value, property);
    default: {
      const needle = filter.value.trim().toLowerCase();
      if (!needle) return true;
      return asText(raw, property).toLowerCase().includes(needle);
    }
  }
}

/** Select filters compare option ids; everything else compares displayed text. */
function valueIs(raw: CellValue, wanted: string, property: Property): boolean {
  if (property.type === "multi_select") return Array.isArray(raw) && raw.includes(wanted);
  if (property.type === "select") return raw === wanted;
  return asText(raw, property).toLowerCase() === wanted.trim().toLowerCase();
}

export function compareRows(
  a: DatabaseRow,
  b: DatabaseRow,
  sort: Sort,
  properties: Property[],
): number {
  const property = properties.find((item) => item.id === sort.property);
  if (!property) return 0;
  const left = a.values[property.id];
  const right = b.values[property.id];

  let result: number;
  if (property.type === "number") {
    const x = left == null || left === "" ? Number.NaN : Number(left);
    const y = right == null || right === "" ? Number.NaN : Number(right);
    // Blanks sort last whichever way the column is pointing.
    if (Number.isNaN(x) && Number.isNaN(y)) result = 0;
    else if (Number.isNaN(x)) return 1;
    else if (Number.isNaN(y)) return -1;
    else result = x - y;
  } else if (property.type === "checkbox") {
    result = Number(Boolean(left)) - Number(Boolean(right));
  } else {
    result = asText(left ?? null, property).localeCompare(asText(right ?? null, property));
  }
  return sort.direction === "desc" ? -result : result;
}

export function visibleRows(data: DatabaseData): DatabaseRow[] {
  const { database, rows } = data;
  const filtered = rows.filter((row) =>
    database.filters.every((filter) => matchesFilter(row, filter, database.properties)),
  );
  if (!database.sorts.length) return filtered;
  return [...filtered].sort((a, b) => {
    for (const sort of database.sorts) {
      const result = compareRows(a, b, sort, database.properties);
      if (result !== 0) return result;
    }
    return a.position - b.position;
  });
}

/** The first text-ish property, used as a row's headline on cards. */
export function titleProperty(properties: Property[]): Property | undefined {
  return properties.find((property) => property.type === "text") ?? properties[0];
}
