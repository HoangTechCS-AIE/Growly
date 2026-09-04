"use client";

import {
  useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  BLOCK_LABEL, EMBED_TYPES, LIST_TYPES, SLASH_COMMANDS, blockId, blockPlainText, emptyBlock,
  filterSlash, isTextBlock, matchShortcut, parseBlocks, parseParams, renderInline, serializeBlocks,
  type Block, type BlockType, type SlashCommand,
} from "@/lib/blocks";
import { TasksEmbed, type EmbedContext } from "./embed-block";
import { DatabaseBlock } from "./database-block";
import { Popover } from "./popover";
import { IconChevronRight, IconGrip, IconPlus, IconCheck } from "./icons";
import { cn } from "@/lib/util";

/* ------------------------------------------------------------ caret helpers */

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function domOffset(root: HTMLElement, node: Node, offset: number): number {
  const range = document.createRange();
  range.selectNodeContents(root);
  try {
    range.setEnd(node, offset);
  } catch {
    return 0;
  }
  return range.toString().length;
}

function caretOffset(el: HTMLElement): number {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return 0;
  const range = selection.getRangeAt(0);
  if (!el.contains(range.endContainer)) return 0;
  return domOffset(el, range.endContainer, range.endOffset);
}

function selectionBounds(el: HTMLElement): [number, number] {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return [0, 0];
  const range = selection.getRangeAt(0);
  if (!el.contains(range.startContainer) || !el.contains(range.endContainer)) return [0, 0];
  return [
    domOffset(el, range.startContainer, range.startOffset),
    domOffset(el, range.endContainer, range.endOffset),
  ];
}

function placeCaret(el: HTMLElement, offset: number) {
  if (el instanceof HTMLTextAreaElement) {
    const position = offset < 0 ? el.value.length : Math.min(offset, el.value.length);
    el.focus({ preventScroll: true });
    el.setSelectionRange(position, position);
    return;
  }
  el.focus({ preventScroll: true });
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  const text = el.firstChild;
  if (text && text.nodeType === Node.TEXT_NODE) {
    const max = text.textContent?.length ?? 0;
    range.setStart(text, offset < 0 ? max : Math.max(0, Math.min(offset, max)));
  } else {
    range.selectNodeContents(el);
    range.collapse(offset === 0);
  }
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

/** Copy text, falling back to a scratch textarea when the Clipboard API is
 *  refused — Firefox without permission and some locked-down Chromium builds. */
function copyText(text: string) {
  const viaTextarea = () => {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.top = "-1000px";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    try {
      document.execCommand("copy");
    } finally {
      area.remove();
    }
  };

  if (!navigator.clipboard?.writeText) {
    viaTextarea();
    return;
  }
  navigator.clipboard.writeText(text).catch(viaTextarea);
}

/* ---------------------------------------------------------------- one block */

interface ContentProps {
  block: Block;
  focused: boolean;
  links: Map<string, string>;
  placeholder: string;
  register: (id: string, el: HTMLElement | null) => void;
  onFocusBlock: (id: string, rawOffset: number) => void;
  onBlur: () => void;
  onText: (id: string, text: string, caret: number) => void;
  onKey: (event: KeyboardEvent<HTMLElement>, block: Block) => void;
  onPasteText: (id: string, text: string) => void;
  composing: React.RefObject<boolean>;
}

function BlockContent({
  block, focused, links, placeholder, register, onFocusBlock, onBlur, onText, onKey,
  onPasteText, composing,
}: ContentProps) {
  const ref = useRef<HTMLDivElement>(null);
  const written = useRef<string | null>(null);
  const router = useRouter();

  const rendered = useMemo(() => renderInline(block.text, links), [block.text, links]);

  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!el || composing.current) return;
    if (focused) {
      if (el.textContent !== block.text) {
        el.textContent = block.text;
        written.current = null;
      }
    } else if (written.current !== rendered.html) {
      el.innerHTML = rendered.html;
      written.current = rendered.html;
    }
  }, [block.text, focused, rendered.html, composing]);

  return (
    <div
      ref={(el) => {
        ref.current = el;
        register(block.id, el);
      }}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="false"
      spellCheck={false}
      data-placeholder={placeholder}
      data-empty={block.text ? undefined : "true"}
      className="nb-content"
      onFocus={() => {
        const el = ref.current;
        if (!el || focused) return;
        // The caret was just dropped into rendered HTML; translate it back to
        // an offset in the Markdown source before the block swaps to raw text.
        const visible = caretOffset(el);
        onFocusBlock(block.id, rendered.map[Math.min(visible, rendered.map.length - 1)] ?? 0);
      }}
      onBlur={onBlur}
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={(event) => {
        composing.current = false;
        const el = event.currentTarget;
        onText(block.id, el.textContent ?? "", caretOffset(el));
      }}
      onInput={(event) => {
        // Composing text is synced too. What must not happen mid-composition is
        // writing *back* to the DOM, and the layout effect above already refuses
        // to. Skipping the sync instead left React believing the block was still
        // empty, so the placeholder kept painting over what the IME was showing.
        const el = event.currentTarget;
        onText(block.id, el.textContent ?? "", caretOffset(el));
      }}
      onKeyDown={(event) => onKey(event, block)}
      onPaste={(event) => {
        event.preventDefault();
        onPasteText(block.id, event.clipboardData.getData("text/plain"));
      }}
      onClick={(event) => {
        const anchor = (event.target as HTMLElement).closest("a[href]") as HTMLAnchorElement | null;
        if (!anchor || focused) return;
        event.preventDefault();
        const href = anchor.getAttribute("href") ?? "";
        if (href.startsWith("/")) router.push(href);
        else window.open(href, "_blank", "noreferrer");
      }}
    />
  );
}

/* -------------------------------------------------------------- the editor */

interface Snapshot {
  blocks: Block[];
  focusedId: string | null;
  caret: number;
}

export interface BlockEditorProps {
  value: string;
  onChange: (markdown: string) => void;
  noteIndex: { id: string; title: string; icon?: string | null }[];
  /** Creates a child page and returns it, for the `/Sub-page` command. */
  onCreateSubpage: (title: string) => Promise<{ id: string; title: string } | null>;
  /** Sends one line to the task list. */
  onBlockToTask: (text: string) => Promise<void>;
  /** Creates a database for the `/Database` command and returns its id. */
  onCreateDatabase: () => Promise<string | null>;
  /** The project a `::tasks` block inherits when it names no filter itself. */
  embedContext: EmbedContext;
  storageKey: string;
}

export function BlockEditor({
  value, onChange, noteIndex, onCreateSubpage, onBlockToTask, onCreateDatabase, embedContext,
  storageKey,
}: BlockEditorProps) {
  const [blocks, setBlocks] = useState<Block[]>(() => parseBlocks(value));
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [menuFor, setMenuFor] = useState<{ id: string; anchor: HTMLElement } | null>(null);
  const [turnInto, setTurnInto] = useState(false);
  const [slash, setSlash] = useState<{ id: string; from: number; query: string } | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);
  const [mention, setMention] = useState<{ id: string; from: number; query: string } | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<{ id: string; after: boolean } | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [flash, setFlash] = useState<string | null>(null);

  const elements = useRef(new Map<string, HTMLElement>());
  const pendingCaret = useRef<{ id: string; offset: number } | null>(null);
  const composing = useRef(false);
  const lastSerialized = useRef(value);
  const container = useRef<HTMLDivElement>(null);
  const dragSelect = useRef<{ from: string | null; active: boolean }>({ from: null, active: false });
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;
  const focusedRef = useRef(focusedId);
  focusedRef.current = focusedId;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  // Block-level edits never reach the browser's own undo stack, so the editor
  // keeps its own. Runs of plain typing coalesce into a single step.
  const history = useRef<{
    past: Snapshot[];
    future: Snapshot[];
    lastKey: string | null;
    lastAt: number;
  }>({ past: [], future: [], lastKey: null, lastAt: 0 });

  const links = useMemo(
    () => new Map(noteIndex.map((note) => [note.title.toLowerCase(), note.id])),
    [noteIndex],
  );

  /* -------------------------------------------------- outside value changes */

  useEffect(() => {
    if (value === lastSerialized.current) return;
    lastSerialized.current = value;
    setBlocks(parseBlocks(value));
  }, [value]);

  const currentCaret = useCallback(() => {
    const id = focusedRef.current;
    if (!id) return 0;
    const el = elements.current.get(id);
    if (!el) return 0;
    return el instanceof HTMLTextAreaElement ? el.selectionStart : caretOffset(el);
  }, []);

  const apply = useCallback(
    (next: Block[]) => {
      const safe = next.length ? next : [emptyBlock()];
      setBlocks(safe);
      const markdown = serializeBlocks(safe);
      lastSerialized.current = markdown;
      onChange(markdown);
      return safe;
    },
    [onChange],
  );

  /** `coalesceKey` groups consecutive edits of the same kind into one undo step. */
  const commit = useCallback(
    (next: Block[], coalesceKey?: string) => {
      const store = history.current;
      const now = Date.now();
      const merges = Boolean(coalesceKey) && coalesceKey === store.lastKey && now - store.lastAt < 700;
      if (!merges) {
        store.past.push({
          blocks: blocksRef.current,
          focusedId: focusedRef.current,
          caret: currentCaret(),
        });
        if (store.past.length > 200) store.past.shift();
      }
      store.future = [];
      store.lastKey = coalesceKey ?? null;
      store.lastAt = now;
      return apply(next);
    },
    [apply, currentCaret],
  );

  const travel = useCallback(
    (direction: "undo" | "redo") => {
      const store = history.current;
      const from = direction === "undo" ? store.past : store.future;
      const to = direction === "undo" ? store.future : store.past;
      const target = from.pop();
      if (!target) return;
      to.push({
        blocks: blocksRef.current,
        focusedId: focusedRef.current,
        caret: currentCaret(),
      });
      store.lastKey = null;
      apply(target.blocks);
      setSelected([]);
      if (target.focusedId && target.blocks.some((block) => block.id === target.focusedId)) {
        setFocusedId(target.focusedId);
        pendingCaret.current = { id: target.focusedId, offset: target.caret };
      }
    },
    [apply, currentCaret],
  );

  /* ------------------------------------------------------ collapsed toggles */

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`growly:collapsed:${storageKey}`);
      if (raw) setCollapsed(new Set(JSON.parse(raw) as string[]));
    } catch {
      // A blocked or full localStorage just means nothing starts collapsed.
    }
  }, [storageKey]);

  const toggleCollapse = (id: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(`growly:collapsed:${storageKey}`, JSON.stringify([...next]));
      } catch {
        // Non-fatal: the fold state simply will not survive a reload.
      }
      return next;
    });
  };

  /* ------------------------------------------------------------ caret queue */

  useIsomorphicLayoutEffect(() => {
    const pending = pendingCaret.current;
    if (!pending) return;
    pendingCaret.current = null;
    const el = elements.current.get(pending.id);
    if (el) placeCaret(el, pending.offset);
  });

  const focusBlock = useCallback((id: string, offset: number) => {
    setFocusedId(id);
    pendingCaret.current = { id, offset };
  }, []);

  const register = useCallback((id: string, el: HTMLElement | null) => {
    if (el) elements.current.set(id, el);
    else elements.current.delete(id);
  }, []);

  const say = (message: string) => {
    setFlash(message);
    setTimeout(() => setFlash(null), 2200);
  };

  /* --------------------------------------------------------- block helpers */

  const indexOf = (id: string) => blocksRef.current.findIndex((block) => block.id === id);

  const patch = useCallback(
    (id: string, changes: Partial<Block>, coalesceKey?: string) => {
      commit(
        blocksRef.current.map((block) => (block.id === id ? { ...block, ...changes } : block)),
        coalesceKey,
      );
    },
    [commit],
  );

  /** A block plus the indented list items that belong to it. */
  const subtreeLength = (index: number): number => {
    const list = blocksRef.current;
    const start = list[index];
    if (!start || !LIST_TYPES.includes(start.type)) return 1;
    let end = index + 1;
    while (end < list.length && LIST_TYPES.includes(list[end].type) && list[end].indent > start.indent) {
      end += 1;
    }
    return end - index;
  };

  /** Editable neighbours, skipping dividers and embeds which hold no caret. */
  const neighbour = (index: number, direction: -1 | 1): Block | null => {
    const list = blocksRef.current;
    for (let i = index + direction; i >= 0 && i < list.length; i += direction) {
      if (isTextBlock(list[i].type)) return list[i];
    }
    return null;
  };

  const closeMenus = () => {
    setSlash(null);
    setMention(null);
    setMenuFor(null);
    setTurnInto(false);
  };

  /* ---------------------------------------------------------- text editing */

  const onText = useCallback(
    (id: string, text: string, caret: number) => {
      const list = blocksRef.current;
      const index = list.findIndex((block) => block.id === id);
      if (index === -1) return;
      const block = list[index];
      const before = text.slice(0, caret);

      // `## ` and friends convert the block the moment the space lands.
      if (before.endsWith(" ")) {
        const shortcut = matchShortcut(before.slice(0, -1));
        if (shortcut) {
          const rest = text.slice(caret);
          const next = [...list];
          if (shortcut.type === "divider") {
            next[index] = { ...block, type: "divider", text: "" };
            next.splice(index + 1, 0, { ...emptyBlock(), text: rest });
            commit(next);
            focusBlock(next[index + 1].id, 0);
          } else {
            next[index] = {
              ...block,
              type: shortcut.type,
              text: rest,
              ...(shortcut.type === "todo" ? { checked: shortcut.checked ?? false } : {}),
              ...(shortcut.type === "callout" ? { emoji: shortcut.emoji ?? "💡" } : {}),
              indent: LIST_TYPES.includes(shortcut.type) ? block.indent : 0,
            };
            commit(next);
            focusBlock(id, 0);
          }
          setSlash(null);
          return;
        }
      }

      // `/` opens the command menu, `[[` opens the page picker.
      const slashAt = before.lastIndexOf("/");
      if (slashAt !== -1 && (slashAt === 0 || /\s/.test(before[slashAt - 1]))) {
        const query = before.slice(slashAt + 1);
        if (!/\s/.test(query)) {
          setSlash({ id, from: slashAt, query });
          setSlashIndex(0);
        } else setSlash(null);
      } else setSlash(null);

      const mentionAt = before.lastIndexOf("[[");
      if (mentionAt !== -1) {
        const query = before.slice(mentionAt + 2);
        if (!query.includes("]")) {
          setMention({ id, from: mentionAt, query });
          setMentionIndex(0);
        } else setMention(null);
      } else setMention(null);

      commit(list.map((item) => (item.id === id ? { ...item, text } : item)), `text:${id}`);
    },
    [commit, focusBlock],
  );

  /* ------------------------------------------------------------ block edits */

  const splitBlock = (block: Block, caret: number) => {
    const list = blocksRef.current;
    const index = list.findIndex((item) => item.id === block.id);
    const head = block.text.slice(0, caret);
    const tail = block.text.slice(caret);

    // Enter on an empty list item steps back out of the list, like Notion.
    if (!block.text && LIST_TYPES.includes(block.type)) {
      const next = [...list];
      next[index] =
        block.indent > 0
          ? { ...block, indent: block.indent - 1 }
          : { ...block, type: "paragraph", indent: 0, checked: undefined };
      commit(next);
      focusBlock(block.id, 0);
      return;
    }

    const continues: BlockType[] = ["bullet", "numbered", "todo", "toggle"];
    const nextType: BlockType = continues.includes(block.type) ? block.type : "paragraph";
    const created: Block = {
      id: blockId(),
      type: nextType,
      text: tail,
      indent: LIST_TYPES.includes(nextType) ? block.indent : 0,
      ...(nextType === "todo" ? { checked: false } : {}),
    };
    const next = [...list];
    next[index] = { ...block, text: head };
    next.splice(index + 1, 0, created);
    commit(next);
    focusBlock(created.id, 0);
  };

  const mergeBackwards = (block: Block) => {
    const list = blocksRef.current;
    const index = list.findIndex((item) => item.id === block.id);
    if (index <= 0) return;
    const previous = list[index - 1];

    if (!isTextBlock(previous.type)) {
      commit(list.filter((item) => item.id !== previous.id));
      focusBlock(block.id, 0);
      return;
    }

    const caret = previous.text.length;
    const next = [...list];
    next[index - 1] = { ...previous, text: previous.text + block.text };
    next.splice(index, 1);
    commit(next);
    focusBlock(previous.id, caret);
  };

  const indentBlock = (block: Block, delta: 1 | -1) => {
    if (!LIST_TYPES.includes(block.type)) return;
    const list = blocksRef.current;
    const index = list.findIndex((item) => item.id === block.id);
    const previous = list[index - 1];
    const ceiling = previous && LIST_TYPES.includes(previous.type) ? previous.indent + 1 : 0;
    const indent = Math.max(0, Math.min(delta > 0 ? ceiling : block.indent - 1, block.indent + delta));
    if (indent === block.indent) return;
    const caret = elements.current.get(block.id);
    const offset = caret ? caretOffset(caret) : block.text.length;
    patch(block.id, { indent });
    focusBlock(block.id, offset);
  };

  const wrapSelection = (block: Block, mark: string) => {
    const el = elements.current.get(block.id);
    if (!el) return;
    const [start, end] = selectionBounds(el);
    const text = block.text;
    const inner = text.slice(start, end) || "text";
    const next = text.slice(0, start) + mark + inner + mark + text.slice(end);
    patch(block.id, { text: next });
    focusBlock(block.id, start + mark.length + inner.length + mark.length);
  };

  const removeBlocksRef = useRef<(ids: string[]) => void>(() => {});

  const removeBlocks = (ids: string[]) => {
    const list = blocksRef.current;
    const first = list.findIndex((block) => ids.includes(block.id));
    // Deleting everything leaves a fresh empty block; focus whatever survived so
    // the caret — and therefore undo — never falls out of the editor.
    const applied = commit(list.filter((block) => !ids.includes(block.id)));
    setSelected([]);
    const target = applied[Math.min(Math.max(0, first - 1), applied.length - 1)];
    if (target) focusBlock(target.id, -1);
  };
  removeBlocksRef.current = removeBlocks;

  const duplicateBlock = (id: string) => {
    const list = blocksRef.current;
    const index = list.findIndex((block) => block.id === id);
    if (index === -1) return;
    const span = subtreeLength(index);
    const copies = list.slice(index, index + span).map((block) => ({ ...block, id: blockId() }));
    const next = [...list];
    next.splice(index + span, 0, ...copies);
    commit(next);
    focusBlock(copies[0].id, -1);
  };

  /** Moving steps over a whole neighbouring group, never into the middle of it. */
  const moveBlock = (id: string, direction: -1 | 1) => {
    const list = blocksRef.current;
    const index = list.findIndex((block) => block.id === id);
    if (index === -1) return;
    const span = subtreeLength(index);
    const block = list[index];

    let insertAt: number;
    if (direction < 0) {
      if (index === 0) return;
      // Walk back past the previous sibling's own indented children.
      let start = index - 1;
      while (
        start > 0 &&
        LIST_TYPES.includes(list[start].type) &&
        LIST_TYPES.includes(block.type) &&
        list[start].indent > block.indent
      ) {
        start -= 1;
      }
      insertAt = start;
    } else {
      const nextIndex = index + span;
      if (nextIndex >= list.length) return;
      insertAt = index + subtreeLength(nextIndex);
    }

    const moved = list.slice(index, index + span);
    const rest = [...list.slice(0, index), ...list.slice(index + span)];
    rest.splice(insertAt, 0, ...moved);
    commit(rest);
  };

  const insertBelow = (id: string) => {
    const list = blocksRef.current;
    const index = list.findIndex((block) => block.id === id);
    const created = emptyBlock();
    const next = [...list];
    next.splice(index + 1, 0, created);
    commit(next);
    focusBlock(created.id, 0);
  };

  const changeType = (id: string, type: BlockType) => {
    const list = blocksRef.current;
    const block = list.find((item) => item.id === id);
    if (!block) return;
    patch(id, {
      type,
      indent: LIST_TYPES.includes(type) ? block.indent : 0,
      ...(type === "todo" ? { checked: block.checked ?? false } : {}),
      ...(type === "callout" ? { emoji: block.emoji ?? "💡" } : {}),
    });
    closeMenus();
    if (isTextBlock(type)) focusBlock(id, -1);
  };

  /* --------------------------------------------------------- slash commands */

  const slashResults = useMemo(() => (slash ? filterSlash(slash.query) : []), [slash]);

  const runSlash = async (command: SlashCommand) => {
    if (!slash) return;
    const list = blocksRef.current;
    const block = list.find((item) => item.id === slash.id);
    if (!block) return;

    const caret = slash.from + 1 + slash.query.length;
    const stripped = block.text.slice(0, slash.from) + block.text.slice(caret);
    setSlash(null);

    if (command.action === "task") {
      patch(block.id, { text: stripped });
      const title = blockPlainText({ ...block, text: stripped });
      if (!title) {
        say("Write the line first");
        return;
      }
      await onBlockToTask(title);
      say("Task created");
      return;
    }

    if (command.action === "link") {
      const next = `${stripped.slice(0, slash.from)}[[${stripped.slice(slash.from)}`;
      patch(block.id, { text: next });
      focusBlock(block.id, slash.from + 2);
      setMention({ id: block.id, from: slash.from, query: "" });
      setMentionIndex(0);
      return;
    }

    if (command.action === "database") {
      const createdId = await onCreateDatabase();
      if (!createdId) return;
      const index = list.findIndex((item) => item.id === block.id);
      const next = [...list];
      next[index] = { ...block, type: "db", text: `id=${createdId}`, indent: 0 };
      const after = { ...emptyBlock(), text: stripped };
      next.splice(index + 1, 0, after);
      commit(next);
      focusBlock(after.id, 0);
      return;
    }

    if (command.action === "subpage") {
      const created = await onCreateSubpage("Untitled");
      if (!created) return;
      const next = `${stripped.slice(0, slash.from)}[[${created.title}]]${stripped.slice(slash.from)}`;
      patch(block.id, { text: next });
      focusBlock(block.id, slash.from + created.title.length + 4);
      say("Sub-page created");
      return;
    }

    if (!command.type) return;
    if (command.type === "divider" || EMBED_TYPES.includes(command.type)) {
      const index = list.findIndex((item) => item.id === block.id);
      const next = [...list];
      next[index] = { ...block, type: command.type, text: "", indent: 0 };
      const after = { ...emptyBlock(), text: stripped };
      next.splice(index + 1, 0, after);
      commit(next);
      focusBlock(after.id, 0);
      return;
    }

    patch(block.id, {
      type: command.type,
      text: stripped,
      indent: LIST_TYPES.includes(command.type) ? block.indent : 0,
      ...(command.type === "todo" ? { checked: false } : {}),
      ...(command.type === "callout" ? { emoji: command.emoji ?? "💡" } : {}),
    });
    focusBlock(block.id, slash.from);
  };

  /* ------------------------------------------------------------- [[ picker */

  const mentionResults = useMemo(() => {
    if (!mention) return [];
    const query = mention.query.trim().toLowerCase();
    return noteIndex
      .filter((note) => !query || note.title.toLowerCase().includes(query))
      .slice(0, 8);
  }, [mention, noteIndex]);

  const applyMention = (title: string) => {
    if (!mention) return;
    const block = blocksRef.current.find((item) => item.id === mention.id);
    if (!block) return;
    const caret = mention.from + 2 + mention.query.length;
    const next = `${block.text.slice(0, mention.from)}[[${title}]]${block.text.slice(caret)}`;
    patch(block.id, { text: next });
    focusBlock(block.id, mention.from + title.length + 4);
    setMention(null);
  };

  const createFromMention = async () => {
    if (!mention) return;
    const title = mention.query.trim() || "Untitled";
    const created = await onCreateSubpage(title);
    if (created) applyMention(created.title);
  };

  /* -------------------------------------------------------------- keyboard */

  const onKey = (event: KeyboardEvent<HTMLElement>, block: Block) => {
    const el = event.currentTarget as HTMLElement;
    const caret = el instanceof HTMLTextAreaElement ? el.selectionStart : caretOffset(el);
    const length = block.text.length;

    if (slash && slash.id === block.id && slashResults.length) {
      if (event.key === "ArrowDown" || (event.key === "Tab" && !event.shiftKey)) {
        event.preventDefault();
        setSlashIndex((i) => (i + 1) % slashResults.length);
        return;
      }
      if (event.key === "ArrowUp" || (event.key === "Tab" && event.shiftKey)) {
        event.preventDefault();
        setSlashIndex((i) => (i - 1 + slashResults.length) % slashResults.length);
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        void runSlash(slashResults[Math.min(slashIndex, slashResults.length - 1)]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setSlash(null);
        return;
      }
    }

    if (mention && mention.id === block.id) {
      const total = mentionResults.length + 1;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setMentionIndex((i) => (i + 1) % total);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setMentionIndex((i) => (i - 1 + total) % total);
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        if (mentionIndex < mentionResults.length) applyMention(mentionResults[mentionIndex].title);
        else void createFromMention();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setMention(null);
        return;
      }
    }

    const meta = event.metaKey || event.ctrlKey;
    // The editor owns undo: a native one would restore DOM text that React
    // knows nothing about, and could never bring a deleted block back.
    if (meta && event.key.toLowerCase() === "z") {
      event.preventDefault();
      travel(event.shiftKey ? "redo" : "undo");
      return;
    }
    if (meta && event.key.toLowerCase() === "y") {
      event.preventDefault();
      travel("redo");
      return;
    }
    if (meta && ["b", "i", "e"].includes(event.key.toLowerCase())) {
      event.preventDefault();
      wrapSelection(block, event.key.toLowerCase() === "b" ? "**" : event.key.toLowerCase() === "i" ? "*" : "`");
      return;
    }
    if (meta && event.key === "Enter" && block.type === "todo") {
      event.preventDefault();
      patch(block.id, { checked: !block.checked });
      return;
    }

    // A code block keeps its own newlines; everything else is one line.
    if (block.type === "code") {
      if (event.key === "Escape" || (meta && event.key === "Enter")) {
        event.preventDefault();
        const index = indexOf(block.id);
        const after = blocksRef.current[index + 1];
        if (after) focusBlock(after.id, 0);
        else insertBelow(block.id);
      }
      if (event.key === "Backspace" && !block.text) {
        event.preventDefault();
        mergeBackwards(block);
      }
      return;
    }

    switch (event.key) {
      case "Enter":
        event.preventDefault();
        splitBlock(block, caret);
        return;
      case "Backspace":
        if (caret !== 0 || selectionBounds(el)[1] !== 0) break;
        event.preventDefault();
        if (block.type !== "paragraph") {
          patch(block.id, { type: "paragraph", indent: 0, checked: undefined, emoji: undefined });
          focusBlock(block.id, 0);
        } else if (block.indent > 0) {
          indentBlock(block, -1);
        } else {
          mergeBackwards(block);
        }
        return;
      case "Delete": {
        if (caret !== length) break;
        const index = indexOf(block.id);
        const after = blocksRef.current[index + 1];
        if (!after) break;
        event.preventDefault();
        if (!isTextBlock(after.type)) {
          commit(blocksRef.current.filter((item) => item.id !== after.id));
        } else {
          const next = blocksRef.current.filter((item) => item.id !== after.id);
          commit(next.map((item) => (item.id === block.id ? { ...item, text: block.text + after.text } : item)));
        }
        focusBlock(block.id, caret);
        return;
      }
      case "Tab":
        event.preventDefault();
        indentBlock(block, event.shiftKey ? -1 : 1);
        return;
      case "ArrowUp": {
        if (caret !== 0) break;
        const previous = neighbour(indexOf(block.id), -1);
        if (!previous) break;
        event.preventDefault();
        focusBlock(previous.id, -1);
        return;
      }
      case "ArrowLeft": {
        if (caret !== 0) break;
        const previous = neighbour(indexOf(block.id), -1);
        if (!previous) break;
        event.preventDefault();
        focusBlock(previous.id, -1);
        return;
      }
      case "ArrowDown": {
        if (caret !== length) break;
        const after = neighbour(indexOf(block.id), 1);
        if (!after) break;
        event.preventDefault();
        focusBlock(after.id, 0);
        return;
      }
      case "ArrowRight": {
        if (caret !== length) break;
        const after = neighbour(indexOf(block.id), 1);
        if (!after) break;
        event.preventDefault();
        focusBlock(after.id, 0);
        return;
      }
      case "Escape":
        closeMenus();
        (event.currentTarget as HTMLElement).blur();
        return;
      default:
        break;
    }
  };

  const onPasteText = (id: string, text: string) => {
    const list = blocksRef.current;
    const index = list.findIndex((block) => block.id === id);
    const block = list[index];
    if (!block) return;
    const el = elements.current.get(id);
    const [start, end] = el ? selectionBounds(el) : [block.text.length, block.text.length];

    if (!text.includes("\n")) {
      const next = block.text.slice(0, start) + text + block.text.slice(end);
      patch(id, { text: next });
      focusBlock(id, start + text.length);
      return;
    }

    const pasted = parseBlocks(text);
    const head = { ...block, text: block.text.slice(0, start) + pasted[0].text };
    const tailText = block.text.slice(end);
    const rest = pasted.slice(1);
    if (rest.length && tailText) rest[rest.length - 1] = { ...rest[rest.length - 1], text: rest[rest.length - 1].text + tailText };
    const next = [...list];
    next.splice(index, 1, head, ...rest);
    commit(next);
    const last = rest.length ? rest[rest.length - 1] : head;
    focusBlock(last.id, last.text.length - tailText.length);
  };

  /* ------------------------------------------------------------ drag & drop */

  const applyDrop = () => {
    if (!dragging || !dropAt || dragging === dropAt.id) {
      setDragging(null);
      setDropAt(null);
      return;
    }
    const list = blocksRef.current;
    const from = list.findIndex((block) => block.id === dragging);
    const span = subtreeLength(from);
    if (from === -1) return;
    const moved = list.slice(from, from + span);
    if (moved.some((block) => block.id === dropAt.id)) {
      setDragging(null);
      setDropAt(null);
      return;
    }
    const rest = [...list.slice(0, from), ...list.slice(from + span)];
    const target = rest.findIndex((block) => block.id === dropAt.id);
    rest.splice(target + (dropAt.after ? 1 : 0), 0, ...moved);
    commit(rest);
    setDragging(null);
    setDropAt(null);
  };

  /* ------------------------------------------------------------- selection */

  const selectHandle = (event: ReactMouseEvent<HTMLElement>, id: string) => {
    if (event.shiftKey && selected.length) {
      const list = blocksRef.current.map((block) => block.id);
      const anchor = list.indexOf(selected[0]);
      const target = list.indexOf(id);
      const [from, to] = anchor < target ? [anchor, target] : [target, anchor];
      setSelected(list.slice(from, to + 1));
      return;
    }
    setSelected([id]);
    setMenuFor({ id, anchor: event.currentTarget });
    setTurnInto(false);
  };

  const selectedToTasks = async () => {
    const list = blocksRef.current.filter((block) => selected.includes(block.id));
    const lines = list.map(blockPlainText).filter(Boolean);
    if (!lines.length) {
      say("Nothing to send");
      return;
    }
    for (const line of lines) await onBlockToTask(line);
    say(`${lines.length} task${lines.length > 1 ? "s" : ""} created`);
    setSelected([]);
    setMenuFor(null);
  };

  /* --------------------------------------------------------------- render */

  useEffect(() => {
    const dismiss = (event: globalThis.MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest("[data-editor-popover]") || target.closest(".nb-handle")) return;
      setMenuFor(null);
      setTurnInto(false);
      setSelected([]);
    };
    document.addEventListener("mousedown", dismiss);
    return () => document.removeEventListener("mousedown", dismiss);
  }, []);

  /* Dragging from one block into another selects whole blocks. Chrome clamps a
     text selection to the editing host it started in, so the range is tracked
     from the pointer rather than read back from the DOM selection. */
  useEffect(() => {
    const rowUnder = (x: number, y: number): string | null => {
      const el = document.elementFromPoint(x, y) as HTMLElement | null;
      const row = el?.closest(".nb-row") as HTMLElement | null;
      if (!row || !container.current?.contains(row)) return null;
      return row.dataset.block ?? null;
    };

    const onMouseDown = (event: globalThis.MouseEvent) => {
      const target = event.target as HTMLElement;
      if (event.button !== 0) return;
      if (target.closest("[data-editor-popover]") || target.closest(".nb-gutter")) return;
      const row = target.closest(".nb-row") as HTMLElement | null;
      if (!row || !container.current?.contains(row)) return;
      dragSelect.current = { from: row.dataset.block ?? null, active: false };
    };

    const onMouseMove = (event: globalThis.MouseEvent) => {
      const drag = dragSelect.current;
      if (!drag.from || event.buttons !== 1) return;
      const over = rowUnder(event.clientX, event.clientY);
      if (!over) return;
      if (over === drag.from && !drag.active) return;

      const ids = blocksRef.current.map((block) => block.id);
      const start = ids.indexOf(drag.from);
      const end = ids.indexOf(over);
      if (start === -1 || end === -1) return;
      if (start === end && !drag.active) return;

      if (!drag.active) {
        drag.active = true;
        setFocusedId(null);
      }
      window.getSelection()?.removeAllRanges();
      setSelected(ids.slice(Math.min(start, end), Math.max(start, end) + 1));
    };

    const onMouseUp = () => {
      dragSelect.current = { from: null, active: false };
    };

    document.addEventListener("mousedown", onMouseDown, true);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousedown", onMouseDown, true);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  /* Undo stays reachable even when the caret has left the editor — as long as
     the key did not land in some other field, which keeps its native undo. */
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      if (key !== "z" && key !== "y") return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest("input, textarea") || target?.isContentEditable) return;
      event.preventDefault();
      travel(key === "y" || event.shiftKey ? "redo" : "undo");
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [travel]);

  /* Block-level selection answers to the keyboard and the clipboard. */
  useEffect(() => {
    if (selected.length < 2) return;

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      // The target is `document` when the key never landed on an element.
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest("input, textarea")) return;
      if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        removeBlocksRef.current(selectedRef.current);
      } else if (event.key === "Escape") {
        setSelected([]);
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        travel(event.shiftKey ? "redo" : "undo");
      } else if (
        (event.metaKey || event.ctrlKey) &&
        ["c", "x"].includes(event.key.toLowerCase())
      ) {
        // With the text selection cleared, a `copy` event may never fire, so
        // the shortcut writes to the clipboard itself.
        const chosen = blocksRef.current.filter((block) =>
          selectedRef.current.includes(block.id),
        );
        if (!chosen.length) return;
        event.preventDefault();
        copyText(serializeBlocks(chosen));
        if (event.key.toLowerCase() === "x") removeBlocksRef.current(selectedRef.current);
      }
    };

    const onCopy = (event: ClipboardEvent) => {
      const chosen = blocksRef.current.filter((block) => selectedRef.current.includes(block.id));
      if (!chosen.length) return;
      event.clipboardData?.setData("text/plain", serializeBlocks(chosen));
      event.preventDefault();
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("copy", onCopy);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("copy", onCopy);
    };
  }, [selected.length, travel]);

  // Numbering and toggle folding are both positional, so resolve them once.
  const view = useMemo(() => {
    const counters: number[] = [];
    let hideUntilIndent: number | null = null;
    return blocks.map((block, index) => {
      let ordinal = 1;
      if (block.type === "numbered") {
        const previous = blocks[index - 1];
        if (!previous || previous.type !== "numbered" || previous.indent < block.indent) {
          counters[block.indent] = 1;
        } else {
          counters[block.indent] = (counters[block.indent] ?? 0) + 1;
        }
        counters.length = block.indent + 1;
        ordinal = counters[block.indent];
      } else if (block.type !== "paragraph" || block.text) {
        counters.length = 0;
      }

      let hidden = false;
      if (hideUntilIndent !== null) {
        if (LIST_TYPES.includes(block.type) && block.indent > hideUntilIndent) hidden = true;
        else hideUntilIndent = null;
      }
      if (!hidden && block.type === "toggle" && collapsed.has(block.id)) hideUntilIndent = block.indent;
      return { block, ordinal, hidden };
    });
  }, [blocks, collapsed]);

  return (
    <div ref={container} className="nb-editor relative">
      {flash && (
        <div className="pointer-events-none sticky top-2 z-30 mb-1 flex justify-center">
          <span className="rounded-full border border-line bg-surface px-3 py-1 text-[11.5px] text-accent shadow-lg">
            {flash}
          </span>
        </div>
      )}

      {selected.length > 1 && (
        <div className="sticky top-2 z-30 mb-2 flex items-center gap-2 rounded-lg border border-line bg-surface px-2 py-1.5 shadow-lg">
          <span className="text-[11.5px] text-muted">{selected.length} blocks selected</span>
          <button type="button" className="btn btn-sm" onClick={() => void selectedToTasks()}>
            Send to tasks
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              const chosen = blocksRef.current.filter((block) => selected.includes(block.id));
              copyText(serializeBlocks(chosen));
              say("Copied as Markdown");
            }}
          >
            Copy
          </button>
          <button type="button" className="btn btn-sm text-danger" onClick={() => removeBlocks(selected)}>
            Delete
          </button>
          <span className="ml-1 text-[11px] text-muted">Ctrl+Z undoes any of this</span>
        </div>
      )}

      {view.map(({ block, ordinal, hidden }) => {
        if (hidden) return null;
        const isFocused = focusedId === block.id;
        const isSelected = selected.includes(block.id);
        // An untouched page keeps its invitation visible; later empty blocks
        // only prompt once the caret is in them.
        const placeholder =
          block.type === "paragraph"
            ? isFocused
              ? "Type '/' for commands"
              : blocks.length === 1
                ? "Write something, or press '/' for commands"
                : ""
            : BLOCK_LABEL[block.type];

        return (
          <div
            key={block.id}
            data-block={block.id}
            data-type={block.type}
            className={cn(
              "nb-row group",
              isSelected && "nb-selected",
              dropAt?.id === block.id && (dropAt.after ? "nb-drop-after" : "nb-drop-before"),
            )}
            style={{ marginLeft: LIST_TYPES.includes(block.type) ? block.indent * 22 : 0 }}
            onDragOver={(event) => {
              if (!dragging) return;
              event.preventDefault();
              const rect = event.currentTarget.getBoundingClientRect();
              setDropAt({ id: block.id, after: event.clientY > rect.top + rect.height / 2 });
            }}
            onDrop={(event) => {
              event.preventDefault();
              applyDrop();
            }}
          >
            <div className="nb-gutter">
              <button
                type="button"
                className="nb-gutter-btn"
                title="Add a block below"
                aria-label="Add a block below"
                onClick={() => insertBelow(block.id)}
              >
                <IconPlus className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                draggable
                className="nb-gutter-btn nb-handle"
                title="Drag to move, click for actions"
                aria-label="Block actions"
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", block.id);
                  setDragging(block.id);
                  setMenuFor(null);
                }}
                onDragEnd={() => {
                  setDragging(null);
                  setDropAt(null);
                }}
                onClick={(event) => selectHandle(event, block.id)}
              >
                <IconGrip className="h-3.5 w-3.5" />
              </button>
            </div>

            {block.type === "divider" ? (
              <hr className="nb-divider" />
            ) : block.type === "tasks" ? (
              <TasksEmbed
                params={block.text}
                context={embedContext}
                selected={isSelected}
                onParams={(next) => patch(block.id, { text: next })}
              />
            ) : block.type === "db" ? (
              <DatabaseBlock databaseId={parseParams(block.text).id ?? ""} selected={isSelected} />
            ) : (
              <>
                {block.type === "bullet" && <span className="nb-marker nb-bullet">•</span>}
                {block.type === "numbered" && <span className="nb-marker nb-ordinal">{ordinal}.</span>}
                {block.type === "todo" && (
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={block.checked ? "true" : "false"}
                    aria-label="Toggle to-do"
                    className={cn("nb-marker nb-check", block.checked && "nb-check-on")}
                    onClick={() => patch(block.id, { checked: !block.checked })}
                  >
                    {block.checked ? <IconCheck className="h-3 w-3" strokeWidth={3} /> : null}
                  </button>
                )}
                {block.type === "toggle" && (
                  <button
                    type="button"
                    aria-expanded={!collapsed.has(block.id)}
                    aria-label="Toggle section"
                    className={cn("nb-marker nb-toggle", !collapsed.has(block.id) && "nb-toggle-open")}
                    onClick={() => toggleCollapse(block.id)}
                  >
                    <IconChevronRight className="h-3 w-3" />
                  </button>
                )}
                {block.type === "callout" && (
                  <button
                    type="button"
                    className="nb-marker nb-emoji"
                    title="Change the callout emoji"
                    onClick={() => {
                      const cycle = ["💡", "⚠️", "✅", "📌", "🔥", "❓"];
                      const at = cycle.indexOf(block.emoji ?? "💡");
                      patch(block.id, { emoji: cycle[(at + 1) % cycle.length] });
                    }}
                  >
                    {block.emoji ?? "💡"}
                  </button>
                )}

                {block.type === "code" ? (
                  <textarea
                    ref={(el) => register(block.id, el)}
                    value={block.text}
                    rows={Math.max(2, block.text.split("\n").length)}
                    spellCheck={false}
                    className="nb-code"
                    placeholder="Code"
                    onFocus={() => setFocusedId(block.id)}
                    onBlur={() => setFocusedId((id) => (id === block.id ? null : id))}
                    onChange={(event) => patch(block.id, { text: event.target.value }, `text:${block.id}`)}
                    onKeyDown={(event) => onKey(event, block)}
                  />
                ) : (
                  <BlockContent
                    block={block}
                    focused={isFocused}
                    links={links}
                    placeholder={placeholder}
                    register={register}
                    onFocusBlock={focusBlock}
                    onBlur={() => setFocusedId((id) => (id === block.id ? null : id))}
                    onText={onText}
                    onKey={onKey}
                    onPasteText={onPasteText}
                    composing={composing}
                  />
                )}
              </>
            )}

            {menuFor?.id === block.id && (
              <Popover
                anchor={menuFor.anchor}
                width={200}
                data-editor-popover
                className="nb-popover nb-menu"
              >
                {turnInto ? (
                  <>
                    <button type="button" className="nb-menu-item nb-menu-back" onClick={() => setTurnInto(false)}>
                      ← Turn into
                    </button>
                    {(Object.keys(BLOCK_LABEL) as BlockType[]).map((type) => (
                      <button
                        key={type}
                        type="button"
                        className={cn("nb-menu-item", block.type === type && "nb-menu-active")}
                        onClick={() => changeType(block.id, type)}
                      >
                        {BLOCK_LABEL[type]}
                      </button>
                    ))}
                  </>
                ) : (
                  <>
                    <button type="button" className="nb-menu-item" onClick={() => setTurnInto(true)}>
                      Turn into…
                    </button>
                    <button type="button" className="nb-menu-item" onClick={() => void selectedToTasks()}>
                      Send to tasks
                    </button>
                    <button type="button" className="nb-menu-item" onClick={() => { duplicateBlock(block.id); closeMenus(); }}>
                      Duplicate
                    </button>
                    <button type="button" className="nb-menu-item" onClick={() => { moveBlock(block.id, -1); closeMenus(); }}>
                      Move up
                    </button>
                    <button type="button" className="nb-menu-item" onClick={() => { moveBlock(block.id, 1); closeMenus(); }}>
                      Move down
                    </button>
                    <button
                      type="button"
                      className="nb-menu-item nb-menu-danger"
                      onClick={() => { removeBlocks([block.id]); closeMenus(); }}
                    >
                      Delete
                    </button>
                  </>
                )}
              </Popover>
            )}

            {slash?.id === block.id && slashResults.length > 0 && (
              <Popover
                anchor={elements.current.get(block.id) ?? null}
                width={260}
                data-editor-popover
                className="nb-popover nb-slash"
              >
                <p className="nb-popover-title">Blocks</p>
                {slashResults.map((command, index) => (
                  <button
                    key={command.key}
                    type="button"
                    className={cn("nb-menu-item", index === slashIndex && "nb-menu-active")}
                    onMouseEnter={() => setSlashIndex(index)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => void runSlash(command)}
                  >
                    <span>{command.label}</span>
                    <span className="nb-menu-hint">{command.hint}</span>
                  </button>
                ))}
              </Popover>
            )}

            {mention?.id === block.id && (
              <Popover
                anchor={elements.current.get(block.id) ?? null}
                width={260}
                data-editor-popover
                className="nb-popover nb-slash"
              >
                <p className="nb-popover-title">Link to page</p>
                {mentionResults.map((note, index) => (
                  <button
                    key={note.id}
                    type="button"
                    className={cn("nb-menu-item", index === mentionIndex && "nb-menu-active")}
                    onMouseEnter={() => setMentionIndex(index)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => applyMention(note.title)}
                  >
                    <span>
                      {note.icon ? `${note.icon} ` : ""}
                      {note.title}
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  className={cn("nb-menu-item", mentionIndex === mentionResults.length && "nb-menu-active")}
                  onMouseEnter={() => setMentionIndex(mentionResults.length)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => void createFromMention()}
                >
                  <span>＋ New sub-page “{mention.query.trim() || "Untitled"}”</span>
                </button>
              </Popover>
            )}
          </div>
        );
      })}

      <button
        type="button"
        className="nb-tail"
        onClick={() => {
          const last = blocks[blocks.length - 1];
          if (last && last.type === "paragraph" && !last.text) focusBlock(last.id, 0);
          else if (last) insertBelow(last.id);
        }}
      >
        Click to keep writing…
      </button>
    </div>
  );
}
