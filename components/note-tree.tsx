"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  archiveNote, createChildNote, createNote, deleteNote, duplicateNote, moveNote,
} from "@/lib/actions";
import type { NoteTreeItem } from "@/lib/types";
import { cn } from "@/lib/util";
import { IconChevronRight, IconMore, IconNote, IconPlus, IconSearch } from "./icons";
import { Popover } from "./popover";

interface TreeNode extends NoteTreeItem {
  children: TreeNode[];
  depth: number;
}

/** Rows come back flat; nest them and drop any orphan under the root. */
function buildTree(items: NoteTreeItem[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  for (const item of items) byId.set(item.id, { ...item, children: [], depth: 0 });

  const roots: TreeNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parent_id ? byId.get(node.parent_id) : undefined;
    if (parent && parent.id !== node.id) parent.children.push(node);
    else roots.push(node);
  }

  const sort = (nodes: TreeNode[], depth: number) => {
    nodes.sort((a, b) => b.pinned - a.pinned || a.position - b.position || a.title.localeCompare(b.title));
    for (const node of nodes) {
      node.depth = depth;
      sort(node.children, depth + 1);
    }
  };
  sort(roots, 0);
  return roots;
}

type DropZone = "before" | "inside" | "after";

export function NoteTree({ items }: { items: NoteTreeItem[] }) {
  const router = useRouter();
  const params = useParams<{ id?: string }>();
  const activeId = params?.id;
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [menuFor, setMenuFor] = useState<{ id: string; anchor: HTMLElement } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; zone: DropZone } | null>(null);
  const loaded = useRef(false);

  const tree = useMemo(() => buildTree(items), [items]);
  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  /* Expansion survives navigation and reloads. */
  useEffect(() => {
    try {
      const raw = localStorage.getItem("growly:tree-open");
      if (raw) setOpen(new Set(JSON.parse(raw) as string[]));
    } catch {
      // Nothing expanded is a fine starting point.
    }
    loaded.current = true;
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem("growly:tree-open", JSON.stringify([...open]));
    } catch {
      // Non-fatal.
    }
  }, [open]);

  /* Opening a page reveals it in the tree. */
  useEffect(() => {
    if (!activeId) return;
    const chain: string[] = [];
    let cursor = byId.get(activeId)?.parent_id ?? null;
    const guard = new Set<string>();
    while (cursor && !guard.has(cursor)) {
      guard.add(cursor);
      chain.push(cursor);
      cursor = byId.get(cursor)?.parent_id ?? null;
    }
    if (chain.length) setOpen((current) => new Set([...current, ...chain]));
  }, [activeId, byId]);

  useEffect(() => {
    const dismiss = (event: MouseEvent) => {
      if ((event.target as HTMLElement).closest("[data-tree-popover]")) return;
      setMenuFor(null);
    };
    document.addEventListener("mousedown", dismiss);
    return () => document.removeEventListener("mousedown", dismiss);
  }, []);

  const toggle = (id: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const keep = new Set<string>();
    for (const item of items) {
      if (!item.title.toLowerCase().includes(q)) continue;
      keep.add(item.id);
      let cursor = item.parent_id;
      const guard = new Set<string>();
      while (cursor && !guard.has(cursor)) {
        guard.add(cursor);
        keep.add(cursor);
        cursor = byId.get(cursor)?.parent_id ?? null;
      }
    }
    return keep;
  }, [query, items, byId]);

  /* ------------------------------------------------------------- mutations */

  const addChild = (parentId: string) =>
    startTransition(async () => {
      const id = await createChildNote(parentId);
      setOpen((current) => new Set([...current, parentId]));
      router.push(`/notes/${id}`);
    });

  const addRoot = () =>
    startTransition(async () => {
      const id = await createNote({ title: "Untitled" });
      router.push(`/notes/${id}`);
    });

  const drop = (target: NoteTreeItem, zone: DropZone) => {
    if (!dragId || dragId === target.id) return;
    const source = dragId;
    startTransition(async () => {
      if (zone === "inside") {
        await moveNote(source, target.id, null);
        setOpen((current) => new Set([...current, target.id]));
      } else {
        const siblings = items
          .filter((item) => item.parent_id === target.parent_id)
          .sort((a, b) => a.position - b.position);
        const at = siblings.findIndex((item) => item.id === target.id);
        const before = zone === "before" ? target.id : (siblings[at + 1]?.id ?? null);
        await moveNote(source, target.parent_id, before);
      }
      router.refresh();
    });
  };

  /* ---------------------------------------------------------------- render */

  const renderNode = (node: TreeNode) => {
    if (matches && !matches.has(node.id)) return null;
    const expanded = open.has(node.id) || (matches !== null && node.children.length > 0);
    const isActive = node.id === activeId;

    return (
      <li key={node.id} className="relative">
        <div
          className={cn(
            "nt-row group",
            isActive && "nt-active",
            dropTarget?.id === node.id && `nt-drop-${dropTarget.zone}`,
          )}
          style={{ paddingLeft: 6 + node.depth * 12 }}
          draggable
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", node.id);
            setDragId(node.id);
          }}
          onDragEnd={() => {
            setDragId(null);
            setDropTarget(null);
          }}
          onDragOver={(event) => {
            if (!dragId || dragId === node.id) return;
            event.preventDefault();
            const rect = event.currentTarget.getBoundingClientRect();
            const ratio = (event.clientY - rect.top) / rect.height;
            setDropTarget({
              id: node.id,
              zone: ratio < 0.25 ? "before" : ratio > 0.75 ? "after" : "inside",
            });
          }}
          onDragLeave={(event) => {
            if (event.currentTarget.contains(event.relatedTarget as Node)) return;
            setDropTarget((current) => (current?.id === node.id ? null : current));
          }}
          onDrop={(event) => {
            event.preventDefault();
            const zone = dropTarget?.id === node.id ? dropTarget.zone : "inside";
            drop(node, zone);
            setDragId(null);
            setDropTarget(null);
          }}
        >
          <button
            type="button"
            className={cn("nt-caret", expanded && "nt-caret-open", !node.child_count && "nt-caret-empty")}
            aria-label={expanded ? "Collapse" : "Expand"}
            aria-expanded={expanded}
            onClick={() => node.child_count > 0 && toggle(node.id)}
          >
            <IconChevronRight />
          </button>

          <Link href={`/notes/${node.id}`} className="nt-link">
            <span className="nt-icon" aria-hidden>{node.icon || <IconNote />}</span>
            <span className="truncate">{node.title || "Untitled"}</span>
          </Link>

          <span className="nt-actions">
            <button
              type="button"
              className="nt-action"
              title="Page actions"
              aria-label="Page actions"
              onClick={(event) => {
                // React clears `currentTarget` once the handler returns, and the
                // updater below runs later — so grab the button now.
                const anchor = event.currentTarget;
                setMenuFor((current) => (current?.id === node.id ? null : { id: node.id, anchor }));
              }}
            >
              <IconMore />
            </button>
            <button
              type="button"
              className="nt-action"
              title="Add a page inside"
              aria-label="Add a page inside"
              disabled={pending}
              onClick={() => addChild(node.id)}
            >
              <IconPlus />
            </button>
          </span>

          {menuFor?.id === node.id && (
            <Popover
              anchor={menuFor.anchor}
              align="end"
              data-tree-popover
              className="nb-popover"
            >
              <button
                type="button"
                className="nb-menu-item"
                onClick={() =>
                  startTransition(async () => {
                    const id = await duplicateNote(node.id);
                    setMenuFor(null);
                    if (id) router.push(`/notes/${id}`);
                  })
                }
              >
                Duplicate
              </button>
              {node.parent_id && (
                <button
                  type="button"
                  className="nb-menu-item"
                  onClick={() =>
                    startTransition(async () => {
                      await moveNote(node.id, null, null);
                      setMenuFor(null);
                      router.refresh();
                    })
                  }
                >
                  Move to top level
                </button>
              )}
              <button
                type="button"
                className="nb-menu-item"
                onClick={() =>
                  startTransition(async () => {
                    await archiveNote(node.id, true);
                    setMenuFor(null);
                    router.refresh();
                  })
                }
              >
                Archive
              </button>
              <button
                type="button"
                className="nb-menu-item nb-menu-danger"
                onClick={() => {
                  const warning = node.child_count
                    ? `Delete “${node.title}” and its ${node.child_count} sub-page(s)?`
                    : `Delete “${node.title}”?`;
                  if (!confirm(warning)) return;
                  startTransition(async () => {
                    await deleteNote(node.id);
                    setMenuFor(null);
                    if (isActive) router.push("/notes");
                    else router.refresh();
                  });
                }}
              >
                Delete
              </button>
            </Popover>
          )}
        </div>

        {expanded && node.children.length > 0 && <ul>{node.children.map(renderNode)}</ul>}
      </li>
    );
  };

  return (
    <div className="nt-panel">
      <div className="nt-search">
        <IconSearch className="h-4 w-4 shrink-0 text-muted" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find a page"
          aria-label="Find a page"
        />
      </div>

      <div
        className={cn("nt-header", dropTarget?.id === "__root" && "nt-drop-inside")}
        onDragOver={(event) => {
          if (!dragId) return;
          event.preventDefault();
          setDropTarget({ id: "__root", zone: "inside" });
        }}
        onDrop={(event) => {
          event.preventDefault();
          if (dragId) {
            const source = dragId;
            startTransition(async () => {
              await moveNote(source, null, null);
              router.refresh();
            });
          }
          setDragId(null);
          setDropTarget(null);
        }}
      >
        <span className="tile-title">Pages</span>
        <button type="button" className="nt-action" title="New page" aria-label="New page" disabled={pending} onClick={addRoot}>
          <IconPlus />
        </button>
      </div>

      <nav aria-label="Page tree" className="nt-tree">
        {tree.length ? (
          <ul>{tree.map(renderNode)}</ul>
        ) : (
          <p className="px-2 py-3 text-sm text-muted">No pages yet.</p>
        )}
      </nav>

      <Link href="/notes" className="nt-footer-link">
        All notes &amp; filters
      </Link>
    </div>
  );
}
