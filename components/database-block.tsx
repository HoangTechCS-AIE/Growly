"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addProperty, addRow, deleteProperty, deleteRow, getDatabase, renameDatabase,
  setDatabaseProperties, setDatabaseRules, setDatabaseView, updateRow,
} from "@/lib/database";
import {
  OPERATOR_LABEL, OPTION_COLORS, PROPERTY_LABEL, asText, emptyValue, operatorsFor, titleProperty,
  visibleRows,
  type CellValue, type DatabaseData, type DatabaseRow, type Filter, type Property,
  type PropertyType, type Sort, type ViewKind,
} from "@/lib/db-schema";
import { cn, monthGrid, todayISO } from "@/lib/util";
import { IconCheck } from "./icons";
import { Popover } from "./popover";

const VIEWS: { key: ViewKind; label: string }[] = [
  { key: "table", label: "Table" },
  { key: "board", label: "Board" },
  { key: "calendar", label: "Calendar" },
];

const uid = () => crypto.randomUUID();

/* ------------------------------------------------------------ select menu -- */

function SelectEditor({
  anchor, property, value, multi, onPick, onProperty, onClose,
}: {
  anchor: HTMLElement | null;
  property: Property;
  value: CellValue;
  multi: boolean;
  onPick: (next: CellValue) => void;
  onProperty: (next: Property) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const options = property.options ?? [];
  const chosen = multi ? ((value as string[]) ?? []) : value ? [value as string] : [];
  const matches = options.filter((option) =>
    option.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const exact = options.some(
    (option) => option.name.toLowerCase() === query.trim().toLowerCase(),
  );

  const create = () => {
    const name = query.trim();
    if (!name) return;
    const option = {
      id: uid(),
      name,
      color: OPTION_COLORS[options.length % OPTION_COLORS.length],
    };
    onProperty({ ...property, options: [...options, option] });
    onPick(multi ? [...chosen, option.id] : option.id);
    setQuery("");
    if (!multi) onClose();
  };

  const toggle = (id: string) => {
    if (!multi) {
      onPick(chosen[0] === id ? "" : id);
      onClose();
      return;
    }
    onPick(chosen.includes(id) ? chosen.filter((item) => item !== id) : [...chosen, id]);
  };

  return (
    <Popover anchor={anchor} width={230} data-db-popover className="db-popover">
      <input
        autoFocus
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search or create…"
        className="db-popover-input"
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            if (matches.length && exact) toggle(matches[0].id);
            else create();
          } else if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
        }}
      />
      <div className="db-popover-list">
        {matches.map((option) => (
          <button
            key={option.id}
            type="button"
            className={cn("db-option-row", chosen.includes(option.id) && "db-option-picked")}
            onClick={() => toggle(option.id)}
          >
            <span className={`db-chip tone-chip tone-${option.color}`}>{option.name}</span>
            {chosen.includes(option.id) && <IconCheck className="h-3.5 w-3.5 text-accent" strokeWidth={2.5} aria-hidden />}
          </button>
        ))}
        {query.trim() && !exact && (
          <button type="button" className="db-option-row" onClick={create}>
            <span>Create “{query.trim()}”</span>
          </button>
        )}
        {!matches.length && !query.trim() && <p className="db-popover-empty">No options yet.</p>}
      </div>
      {multi && (
        <button type="button" className="db-popover-done" onClick={onClose}>
          Done
        </button>
      )}
    </Popover>
  );
}

/* ------------------------------------------------------------------ cell -- */

function Cell({
  property, value, onChange, onProperty, compact = false,
}: {
  property: Property;
  value: CellValue;
  onChange: (next: CellValue) => void;
  onProperty: (next: Property) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: MouseEvent) => {
      if ((event.target as HTMLElement).closest("[data-db-popover]")) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", dismiss);
    return () => document.removeEventListener("mousedown", dismiss);
  }, [open]);

  if (property.type === "checkbox") {
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={value === true}
        aria-label={property.name}
        className={cn("nb-check", value === true && "nb-check-on")}
        onClick={() => onChange(value !== true)}
      >
        {value === true ? <IconCheck className="h-3 w-3" strokeWidth={3} /> : null}
      </button>
    );
  }

  if (property.type === "select" || property.type === "multi_select") {
    const multi = property.type === "multi_select";
    const ids = multi ? ((value as string[]) ?? []) : value ? [value as string] : [];
    const picked = ids
      .map((id) => property.options?.find((option) => option.id === id))
      .filter(Boolean) as { id: string; name: string; color: string }[];
    return (
      <div className="db-cell-select">
        <button
          ref={anchor}
          type="button"
          className="db-cell-button"
          onClick={() => setOpen((o) => !o)}
        >
          {picked.length ? (
            picked.map((option) => (
              <span key={option.id} className={`db-chip tone-chip tone-${option.color}`}>
                {option.name}
              </span>
            ))
          ) : (
            <span className="db-cell-blank">Empty</span>
          )}
        </button>
        {open && (
          <SelectEditor
            anchor={anchor.current}
            property={property}
            value={value}
            multi={multi}
            onPick={onChange}
            onProperty={onProperty}
            onClose={() => setOpen(false)}
          />
        )}
      </div>
    );
  }

  if (property.type === "date") {
    return (
      <input
        type="date"
        value={(value as string) ?? ""}
        onChange={(event) => onChange(event.target.value)}
        aria-label={property.name}
        className="db-cell-input"
      />
    );
  }

  if (property.type === "number") {
    return (
      <input
        type="number"
        value={value == null ? "" : String(value)}
        onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))}
        aria-label={property.name}
        className="db-cell-input db-cell-number"
      />
    );
  }

  return (
    <input
      value={(value as string) ?? ""}
      onChange={(event) => onChange(event.target.value)}
      placeholder={compact ? property.name : ""}
      aria-label={property.name}
      className={cn("db-cell-input", property.type === "url" && "db-cell-url")}
    />
  );
}

/* -------------------------------------------------------- property header -- */

function PropertyHeader({
  property, sort, onProperty, onDelete, onSort,
}: {
  property: Property;
  sort: Sort | undefined;
  onProperty: (next: Property) => void;
  onDelete: () => void;
  onSort: (direction: "asc" | "desc" | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: MouseEvent) => {
      if ((event.target as HTMLElement).closest("[data-db-popover]")) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", dismiss);
    return () => document.removeEventListener("mousedown", dismiss);
  }, [open]);

  return (
    <div className="db-head-cell">
      <button
        ref={anchor}
        type="button"
        className="db-head-button"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="truncate">{property.name}</span>
        {sort && <span aria-hidden>{sort.direction === "asc" ? "↑" : "↓"}</span>}
      </button>
      {open && (
        <Popover anchor={anchor.current} width={230} data-db-popover className="db-popover">
          <input
            className="db-popover-input"
            value={property.name}
            aria-label="Property name"
            onChange={(event) => onProperty({ ...property, name: event.target.value })}
          />
          <label className="db-popover-field">
            <span>Type</span>
            <select
              value={property.type}
              onChange={(event) => {
                const type = event.target.value as PropertyType;
                onProperty({
                  ...property,
                  type,
                  options:
                    type === "select" || type === "multi_select" ? (property.options ?? []) : undefined,
                });
              }}
            >
              {Object.entries(PROPERTY_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="db-popover-item" onClick={() => onSort("asc")}>
            Sort ascending
          </button>
          <button type="button" className="db-popover-item" onClick={() => onSort("desc")}>
            Sort descending
          </button>
          {sort && (
            <button type="button" className="db-popover-item" onClick={() => onSort(null)}>
              Clear sort
            </button>
          )}
          <button
            type="button"
            className="db-popover-item db-popover-danger"
            onClick={() => {
              if (confirm(`Delete the “${property.name}” property and its values?`)) onDelete();
            }}
          >
            Delete property
          </button>
        </Popover>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ root -- */

export function DatabaseBlock({
  databaseId, selected,
}: {
  databaseId: string;
  selected: boolean;
}) {
  const [data, setData] = useState<DatabaseData | null>(null);
  const [missing, setMissing] = useState(false);
  const [panel, setPanel] = useState<"filter" | "sort" | "property" | null>(null);
  const [newProperty, setNewProperty] = useState({ name: "", type: "text" as PropertyType });
  const saveTimer = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    let cancelled = false;
    getDatabase(databaseId)
      .then((result) => {
        if (cancelled) return;
        if (!result) setMissing(true);
        else setData(result);
      })
      .catch(() => {
        if (!cancelled) setMissing(true);
      });
    return () => {
      cancelled = true;
    };
  }, [databaseId]);

  useEffect(() => {
    if (!panel) return;
    const dismiss = (event: MouseEvent) => {
      if ((event.target as HTMLElement).closest("[data-db-panel]")) return;
      setPanel(null);
    };
    document.addEventListener("mousedown", dismiss);
    return () => document.removeEventListener("mousedown", dismiss);
  }, [panel]);

  const patchDatabase = useCallback(
    (changes: Partial<DatabaseData["database"]>) =>
      setData((current) =>
        current ? { ...current, database: { ...current.database, ...changes } } : current,
      ),
    [],
  );

  /** Cell edits are frequent; hold them briefly so typing is not one write per key. */
  const writeRow = useCallback(
    (rowId: string, values: Record<string, CellValue>) => {
      clearTimeout(saveTimer.current[rowId]);
      saveTimer.current[rowId] = setTimeout(() => {
        void updateRow(databaseId, rowId, values);
      }, 400);
    },
    [databaseId],
  );

  useEffect(() => {
    const timers = saveTimer.current;
    return () => Object.values(timers).forEach(clearTimeout);
  }, []);

  if (missing) {
    return (
      <div className={cn("nb-embed", selected && "nb-embed-selected")}>
        <p className="nb-embed-empty">This database no longer exists.</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className={cn("nb-embed", selected && "nb-embed-selected")}>
        <p className="nb-embed-empty">Loading database…</p>
      </div>
    );
  }

  const { database } = data;
  const properties = database.properties;
  const rows = visibleRows(data);

  const setCell = (row: DatabaseRow, propertyId: string, next: CellValue) => {
    const values = { ...row.values, [propertyId]: next };
    setData((current) =>
      current
        ? {
            ...current,
            rows: current.rows.map((item) => (item.id === row.id ? { ...item, values } : item)),
          }
        : current,
    );
    writeRow(row.id, values);
  };

  const saveProperty = (next: Property) => {
    const properties_ = properties.map((item) => (item.id === next.id ? next : item));
    patchDatabase({ properties: properties_ });
    void setDatabaseProperties(databaseId, properties_);
  };

  const removeProperty = (propertyId: string) => {
    patchDatabase({
      properties: properties.filter((item) => item.id !== propertyId),
      filters: database.filters.filter((filter) => filter.property !== propertyId),
      sorts: database.sorts.filter((sort) => sort.property !== propertyId),
      group_by: database.group_by === propertyId ? null : database.group_by,
      date_prop: database.date_prop === propertyId ? null : database.date_prop,
    });
    void deleteProperty(databaseId, propertyId);
  };

  const applySort = (propertyId: string, direction: "asc" | "desc" | null) => {
    const sorts = direction
      ? [{ id: uid(), property: propertyId, direction }]
      : database.sorts.filter((sort) => sort.property !== propertyId);
    patchDatabase({ sorts });
    void setDatabaseRules(databaseId, { sorts });
  };

  const setFilters = (filters: Filter[]) => {
    patchDatabase({ filters });
    void setDatabaseRules(databaseId, { filters });
  };

  const newRow = async (preset: Record<string, CellValue> = {}) => {
    const created = await addRow(databaseId, preset);
    if (!created) return;
    setData((current) => (current ? { ...current, rows: [...current.rows, created] } : current));
  };

  const removeRow = (rowId: string) => {
    setData((current) =>
      current ? { ...current, rows: current.rows.filter((row) => row.id !== rowId) } : current,
    );
    void deleteRow(databaseId, rowId);
  };

  const switchView = (view: ViewKind) => {
    patchDatabase({ view });
    void setDatabaseView(databaseId, { view });
  };

  const selectProps = properties.filter((property) => property.type === "select");
  const dateProps = properties.filter((property) => property.type === "date");

  return (
    <div className={cn("db-block", selected && "db-block-selected")}>
      <div className="db-toolbar">
        <input
          className="db-title"
          value={database.title}
          aria-label="Database title"
          onChange={(event) => {
            patchDatabase({ title: event.target.value });
            void renameDatabase(databaseId, event.target.value);
          }}
        />

        <div className="db-views">
          {VIEWS.map((view) => (
            <button
              key={view.key}
              type="button"
              aria-pressed={database.view === view.key}
              className={cn("db-view-tab", database.view === view.key && "db-view-active")}
              onClick={() => switchView(view.key)}
            >
              {view.label}
            </button>
          ))}
        </div>

        <div className="db-tool-actions">
          <button
            type="button"
            className={cn("db-tool", database.filters.length > 0 && "db-tool-on")}
            onClick={() => setPanel(panel === "filter" ? null : "filter")}
          >
            Filter{database.filters.length ? ` (${database.filters.length})` : ""}
          </button>
          <button
            type="button"
            className={cn("db-tool", database.sorts.length > 0 && "db-tool-on")}
            onClick={() => setPanel(panel === "sort" ? null : "sort")}
          >
            Sort{database.sorts.length ? ` (${database.sorts.length})` : ""}
          </button>
          <button type="button" className="db-tool db-tool-primary" onClick={() => void newRow()}>
            New
          </button>
        </div>

        {panel === "filter" && (
          <div data-db-panel className="db-panel">
            {database.filters.length === 0 && <p className="db-panel-empty">No filters yet.</p>}
            {database.filters.map((filter) => {
              const property = properties.find((item) => item.id === filter.property);
              const operators = property ? operatorsFor(property.type) : ["contains" as const];
              const needsValue = !["empty", "not_empty", "checked", "unchecked"].includes(
                filter.operator,
              );
              return (
                <div key={filter.id} className="db-rule">
                  <select
                    value={filter.property}
                    aria-label="Filter property"
                    onChange={(event) => {
                      const target = properties.find((item) => item.id === event.target.value);
                      setFilters(
                        database.filters.map((item) =>
                          item.id === filter.id
                            ? {
                                ...item,
                                property: event.target.value,
                                operator: target ? operatorsFor(target.type)[0] : "contains",
                                value: "",
                              }
                            : item,
                        ),
                      );
                    }}
                  >
                    {properties.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={filter.operator}
                    aria-label="Filter operator"
                    onChange={(event) =>
                      setFilters(
                        database.filters.map((item) =>
                          item.id === filter.id
                            ? { ...item, operator: event.target.value as Filter["operator"] }
                            : item,
                        ),
                      )
                    }
                  >
                    {operators.map((operator) => (
                      <option key={operator} value={operator}>
                        {OPERATOR_LABEL[operator]}
                      </option>
                    ))}
                  </select>
                  {needsValue &&
                    (property && (property.type === "select" || property.type === "multi_select") ? (
                      <select
                        value={filter.value}
                        aria-label="Filter value"
                        onChange={(event) =>
                          setFilters(
                            database.filters.map((item) =>
                              item.id === filter.id ? { ...item, value: event.target.value } : item,
                            ),
                          )
                        }
                      >
                        <option value="">Choose…</option>
                        {(property.options ?? []).map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        value={filter.value}
                        aria-label="Filter value"
                        type={property?.type === "date" ? "date" : "text"}
                        onChange={(event) =>
                          setFilters(
                            database.filters.map((item) =>
                              item.id === filter.id ? { ...item, value: event.target.value } : item,
                            ),
                          )
                        }
                      />
                    ))}
                  <button
                    type="button"
                    className="db-rule-remove"
                    aria-label="Remove filter"
                    onClick={() =>
                      setFilters(database.filters.filter((item) => item.id !== filter.id))
                    }
                  >
                    ×
                  </button>
                </div>
              );
            })}
            <button
              type="button"
              className="db-panel-add"
              disabled={!properties.length}
              onClick={() =>
                setFilters([
                  ...database.filters,
                  {
                    id: uid(),
                    property: properties[0].id,
                    operator: operatorsFor(properties[0].type)[0],
                    value: "",
                  },
                ])
              }
            >
              ＋ Add filter
            </button>
          </div>
        )}

        {panel === "sort" && (
          <div data-db-panel className="db-panel">
            {database.sorts.length === 0 && <p className="db-panel-empty">No sorts yet.</p>}
            {database.sorts.map((sort) => (
              <div key={sort.id} className="db-rule">
                <select
                  value={sort.property}
                  aria-label="Sort property"
                  onChange={(event) => {
                    const sorts = database.sorts.map((item) =>
                      item.id === sort.id ? { ...item, property: event.target.value } : item,
                    );
                    patchDatabase({ sorts });
                    void setDatabaseRules(databaseId, { sorts });
                  }}
                >
                  {properties.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <select
                  value={sort.direction}
                  aria-label="Sort direction"
                  onChange={(event) => {
                    const sorts = database.sorts.map((item) =>
                      item.id === sort.id
                        ? { ...item, direction: event.target.value as "asc" | "desc" }
                        : item,
                    );
                    patchDatabase({ sorts });
                    void setDatabaseRules(databaseId, { sorts });
                  }}
                >
                  <option value="asc">Ascending</option>
                  <option value="desc">Descending</option>
                </select>
                <button
                  type="button"
                  className="db-rule-remove"
                  aria-label="Remove sort"
                  onClick={() => {
                    const sorts = database.sorts.filter((item) => item.id !== sort.id);
                    patchDatabase({ sorts });
                    void setDatabaseRules(databaseId, { sorts });
                  }}
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              className="db-panel-add"
              disabled={!properties.length}
              onClick={() => {
                const sorts = [
                  ...database.sorts,
                  { id: uid(), property: properties[0].id, direction: "asc" as const },
                ];
                patchDatabase({ sorts });
                void setDatabaseRules(databaseId, { sorts });
              }}
            >
              ＋ Add sort
            </button>
          </div>
        )}

        {panel === "property" && (
          <div data-db-panel className="db-panel">
            <div className="db-rule">
              <input
                autoFocus
                value={newProperty.name}
                placeholder="Property name"
                aria-label="New property name"
                onChange={(event) => setNewProperty((c) => ({ ...c, name: event.target.value }))}
              />
              <select
                value={newProperty.type}
                aria-label="New property type"
                onChange={(event) =>
                  setNewProperty((c) => ({ ...c, type: event.target.value as PropertyType }))
                }
              >
                {Object.entries(PROPERTY_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="db-panel-add"
              onClick={async () => {
                const created = await addProperty(databaseId, newProperty.name, newProperty.type);
                if (created) patchDatabase({ properties: [...properties, created] });
                setNewProperty({ name: "", type: "text" });
                setPanel(null);
              }}
            >
              ＋ Add property
            </button>
          </div>
        )}
      </div>

      {database.view === "table" && (
        <TableView
          properties={properties}
          rows={rows}
          sorts={database.sorts}
          onCell={setCell}
          onProperty={saveProperty}
          onDeleteProperty={removeProperty}
          onSort={applySort}
          onDeleteRow={removeRow}
          onNewRow={() => void newRow()}
          onNewProperty={() => setPanel(panel === "property" ? null : "property")}
        />
      )}

      {database.view === "board" && (
        <BoardView
          database={database}
          rows={rows}
          selectProps={selectProps}
          onGroupBy={(id) => {
            patchDatabase({ group_by: id });
            void setDatabaseView(databaseId, { group_by: id });
          }}
          onCell={setCell}
          onProperty={saveProperty}
          onNewRow={(preset) => void newRow(preset)}
        />
      )}

      {database.view === "calendar" && (
        <CalendarView
          database={database}
          rows={rows}
          dateProps={dateProps}
          onDateProp={(id) => {
            patchDatabase({ date_prop: id });
            void setDatabaseView(databaseId, { date_prop: id });
          }}
          onNewRow={(preset) => void newRow(preset)}
        />
      )}

      <p className="db-count">
        {rows.length} of {data.rows.length} row(s)
        {database.filters.length > 0 && " after filters"}
      </p>
    </div>
  );
}

/* ----------------------------------------------------------------- table -- */

function TableView({
  properties, rows, sorts, onCell, onProperty, onDeleteProperty, onSort, onDeleteRow, onNewRow,
  onNewProperty,
}: {
  properties: Property[];
  rows: DatabaseRow[];
  sorts: Sort[];
  onCell: (row: DatabaseRow, propertyId: string, next: CellValue) => void;
  onProperty: (next: Property) => void;
  onDeleteProperty: (propertyId: string) => void;
  onSort: (propertyId: string, direction: "asc" | "desc" | null) => void;
  onDeleteRow: (rowId: string) => void;
  onNewRow: () => void;
  onNewProperty: () => void;
}) {
  return (
    <div className="db-scroll">
      <table className="db-table">
        <thead>
          <tr>
            {properties.map((property) => (
              <th key={property.id}>
                <PropertyHeader
                  property={property}
                  sort={sorts.find((sort) => sort.property === property.id)}
                  onProperty={onProperty}
                  onDelete={() => onDeleteProperty(property.id)}
                  onSort={(direction) => onSort(property.id, direction)}
                />
              </th>
            ))}
            <th className="db-add-col">
              <button type="button" onClick={onNewProperty} aria-label="Add a property">
                ＋
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="group">
              {properties.map((property) => (
                <td key={property.id}>
                  <Cell
                    property={property}
                    value={row.values[property.id] ?? emptyValue(property.type)}
                    onChange={(next) => onCell(row, property.id, next)}
                    onProperty={onProperty}
                  />
                </td>
              ))}
              <td className="db-row-actions">
                <button
                  type="button"
                  className="row-actions"
                  aria-label="Delete row"
                  onClick={() => onDeleteRow(row.id)}
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={properties.length + 1} className="db-empty">
                Nothing here yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <button type="button" className="db-new-row" onClick={onNewRow}>
        ＋ New row
      </button>
    </div>
  );
}

/* ----------------------------------------------------------------- board -- */

function BoardView({
  database, rows, selectProps, onGroupBy, onCell, onProperty, onNewRow,
}: {
  database: DatabaseData["database"];
  rows: DatabaseRow[];
  selectProps: Property[];
  onGroupBy: (propertyId: string | null) => void;
  onCell: (row: DatabaseRow, propertyId: string, next: CellValue) => void;
  onProperty: (next: Property) => void;
  onNewRow: (preset: Record<string, CellValue>) => void;
}) {
  const [dragged, setDragged] = useState<string | null>(null);
  const group = database.properties.find((property) => property.id === database.group_by);
  const title = titleProperty(database.properties);

  if (!group) {
    return (
      <div className="db-board-setup">
        <p>Group the board by a select property:</p>
        <select
          value=""
          aria-label="Group by"
          onChange={(event) => onGroupBy(event.target.value || null)}
        >
          <option value="">Choose a property…</option>
          {selectProps.map((property) => (
            <option key={property.id} value={property.id}>
              {property.name}
            </option>
          ))}
        </select>
        {!selectProps.length && <p className="db-panel-empty">Add a Select property first.</p>}
      </div>
    );
  }

  const columns = [
    { id: "", name: "No " + group.name.toLowerCase(), color: "slate" },
    ...(group.options ?? []),
  ];

  return (
    <>
      <div className="db-board-bar">
        <span>Grouped by</span>
        <select
          value={group.id}
          aria-label="Group by"
          onChange={(event) => onGroupBy(event.target.value || null)}
        >
          {selectProps.map((property) => (
            <option key={property.id} value={property.id}>
              {property.name}
            </option>
          ))}
        </select>
      </div>
      <div className="db-scroll">
        <div className="db-board">
          {columns.map((column) => {
            const cards = rows.filter((row) => (row.values[group.id] ?? "") === column.id);
            return (
              <div
                key={column.id || "__none"}
                className="db-column"
                onDragOver={(event) => {
                  if (dragged) event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const row = rows.find((item) => item.id === dragged);
                  if (row) onCell(row, group.id, column.id);
                  setDragged(null);
                }}
              >
                <div className="db-column-head">
                  <span className={`db-chip tone-chip tone-${column.color}`}>{column.name}</span>
                  <span className="db-column-count">{cards.length}</span>
                </div>
                {cards.map((row) => (
                  <div
                    key={row.id}
                    className="db-card"
                    draggable
                    onDragStart={() => setDragged(row.id)}
                    onDragEnd={() => setDragged(null)}
                  >
                    {title && (
                      <Cell
                        property={title}
                        value={row.values[title.id] ?? emptyValue(title.type)}
                        onChange={(next) => onCell(row, title.id, next)}
                        onProperty={onProperty}
                        compact
                      />
                    )}
                    <div className="db-card-meta">
                      {database.properties
                        .filter(
                          (property) => property.id !== group.id && property.id !== title?.id,
                        )
                        .slice(0, 2)
                        .map((property) => {
                          const text = asText(row.values[property.id] ?? null, property);
                          if (!text) return null;
                          return (
                            <span key={property.id} className="db-card-chip">
                              {text}
                            </span>
                          );
                        })}
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  className="db-column-add"
                  onClick={() => onNewRow({ [group.id]: column.id })}
                >
                  ＋ New
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

/* -------------------------------------------------------------- calendar -- */

function CalendarView({
  database, rows, dateProps, onDateProp, onNewRow,
}: {
  database: DatabaseData["database"];
  rows: DatabaseRow[];
  dateProps: Property[];
  onDateProp: (propertyId: string | null) => void;
  onNewRow: (preset: Record<string, CellValue>) => void;
}) {
  const [anchor, setAnchor] = useState(todayISO());
  const property = database.properties.find((item) => item.id === database.date_prop);
  const title = titleProperty(database.properties);
  const days = useMemo(() => monthGrid(anchor), [anchor]);
  const today = todayISO();

  const byDay = useMemo(() => {
    const map = new Map<string, DatabaseRow[]>();
    if (!property) return map;
    for (const row of rows) {
      const value = row.values[property.id];
      if (typeof value !== "string" || !value) continue;
      const list = map.get(value) ?? [];
      list.push(row);
      map.set(value, list);
    }
    return map;
  }, [rows, property]);

  if (!property) {
    return (
      <div className="db-board-setup">
        <p>Lay the calendar out by a date property:</p>
        <select
          value=""
          aria-label="Date property"
          onChange={(event) => onDateProp(event.target.value || null)}
        >
          <option value="">Choose a property…</option>
          {dateProps.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        {!dateProps.length && <p className="db-panel-empty">Add a Date property first.</p>}
      </div>
    );
  }

  const month = anchor.slice(0, 7);

  return (
    <>
      <div className="db-board-bar">
        <button
          type="button"
          onClick={() => {
            const date = new Date(`${anchor}T00:00:00`);
            date.setMonth(date.getMonth() - 1, 1);
            setAnchor(date.toISOString().slice(0, 10));
          }}
          aria-label="Previous month"
        >
          ‹
        </button>
        <strong>{month}</strong>
        <button
          type="button"
          onClick={() => {
            const date = new Date(`${anchor}T00:00:00`);
            date.setMonth(date.getMonth() + 1, 1);
            setAnchor(date.toISOString().slice(0, 10));
          }}
          aria-label="Next month"
        >
          ›
        </button>
        <span>by</span>
        <select
          value={property.id}
          aria-label="Date property"
          onChange={(event) => onDateProp(event.target.value || null)}
        >
          {dateProps.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </div>
      <div className="db-calendar">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label) => (
          <div key={label} className="db-cal-label">
            {label}
          </div>
        ))}
        {days.map((day) => (
          <div
            key={day}
            className={cn(
              "db-cal-day",
              day.slice(0, 7) !== month && "db-cal-outside",
              day === today && "db-cal-today",
            )}
          >
            <button
              type="button"
              className="db-cal-number"
              title="Add a row on this day"
              onClick={() => onNewRow({ [property.id]: day })}
            >
              {Number(day.slice(8, 10))}
            </button>
            {(byDay.get(day) ?? []).map((row) => (
              <span key={row.id} className="db-cal-item">
                {title ? asText(row.values[title.id] ?? null, title) || "Untitled" : "Row"}
              </span>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
