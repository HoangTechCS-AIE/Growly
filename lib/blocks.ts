/** Markdown ⇄ blocks.
 *
 *  The note editor is block-based, but Markdown stays the stored format so
 *  search, `[[backlinks]]`, "line → task" and list previews keep working on the
 *  raw text. The mapping is deliberately one line ⇄ one block (fenced code is
 *  the single exception), which makes the round trip lossless enough that a
 *  note edited here still reads like a normal Markdown file.
 */

export type BlockType =
  | "paragraph"
  | "h1"
  | "h2"
  | "h3"
  | "bullet"
  | "numbered"
  | "todo"
  | "toggle"
  | "quote"
  | "callout"
  | "code"
  | "divider"
  | "tasks"
  | "goal"
  | "db";

export interface Block {
  id: string;
  type: BlockType;
  /** Raw Markdown of this block's inline content, without the line prefix. */
  text: string;
  indent: number;
  checked?: boolean;
  /** Callout emoji. */
  emoji?: string;
  /** Code fence language. */
  lang?: string;
}

/** Types that carry a list marker, and so are the only ones allowed to indent. */
export const LIST_TYPES: BlockType[] = ["bullet", "numbered", "todo", "toggle"];

export const BLOCK_LABEL: Record<BlockType, string> = {
  paragraph: "Text",
  h1: "Heading 1",
  h2: "Heading 2",
  h3: "Heading 3",
  bullet: "Bulleted list",
  numbered: "Numbered list",
  todo: "To-do list",
  toggle: "Toggle list",
  quote: "Quote",
  callout: "Callout",
  code: "Code",
  divider: "Divider",
  tasks: "Task list",
  goal: "Goal progress",
  db: "Database",
};

/** Blocks that hold no caret: navigation and merging step over them. */
export const EMBED_TYPES: BlockType[] = ["tasks", "goal", "db"];

export function isTextBlock(type: BlockType): boolean {
  return type !== "divider" && !EMBED_TYPES.includes(type);
}

/** `::tasks project=abc status=planned,doing` → { project, status }. */
export function parseParams(text: string): Record<string, string> {
  const params: Record<string, string> = {};
  for (const pair of text.trim().split(/\s+/)) {
    if (!pair) continue;
    const at = pair.indexOf("=");
    if (at <= 0) continue;
    params[pair.slice(0, at)] = pair.slice(at + 1);
  }
  return params;
}

export function stringifyParams(params: Record<string, string>): string {
  return Object.entries(params)
    .filter(([, value]) => value !== "")
    .map(([key, value]) => `${key}=${value}`)
    .join(" ");
}

let counter = 0;
export function blockId(): string {
  counter += 1;
  return `b${counter}_${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyBlock(type: BlockType = "paragraph", indent = 0): Block {
  return { id: blockId(), type, text: "", indent, ...(type === "todo" ? { checked: false } : {}) };
}

/* ------------------------------------------------------------------- parsing */

const FENCE = /^\s*```(\w+)?\s*$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const EMBED = /^::(tasks|goal|db)\b\s*(.*)$/;
const DIVIDER = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const CALLOUT = /^>\s*\[!([^\]]*)\]\s?(.*)$/;
const QUOTE = /^>\s?(.*)$/;
const TODO = /^(\s*)[-*]\s+\[([ xX])\]\s?(.*)$/;
const TOGGLE = /^(\s*)[-*]\s+\[>\]\s?(.*)$/;
const BULLET = /^(\s*)[-*]\s+(.*)$/;
const NUMBERED = /^(\s*)\d+[.)]\s+(.*)$/;

function indentOf(spaces: string): number {
  return Math.min(6, Math.floor(spaces.replace(/\t/g, "  ").length / 2));
}

export function parseBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    const fence = line.match(FENCE);
    if (fence) {
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !FENCE.test(lines[i])) {
        body.push(lines[i]);
        i += 1;
      }
      blocks.push({ id: blockId(), type: "code", text: body.join("\n"), indent: 0, lang: fence[1] ?? "" });
      continue;
    }

    if (DIVIDER.test(line)) {
      blocks.push({ id: blockId(), type: "divider", text: "", indent: 0 });
      continue;
    }

    const embed = line.match(EMBED);
    if (embed) {
      blocks.push({ id: blockId(), type: embed[1] as BlockType, text: embed[2].trim(), indent: 0 });
      continue;
    }

    const heading = line.match(HEADING);
    if (heading) {
      const level = Math.min(3, heading[1].length);
      blocks.push({ id: blockId(), type: `h${level}` as BlockType, text: heading[2], indent: 0 });
      continue;
    }

    const callout = line.match(CALLOUT);
    if (callout) {
      blocks.push({ id: blockId(), type: "callout", text: callout[2], indent: 0, emoji: callout[1] || "💡" });
      continue;
    }

    const quote = line.match(QUOTE);
    if (quote) {
      blocks.push({ id: blockId(), type: "quote", text: quote[1], indent: 0 });
      continue;
    }

    const toggle = line.match(TOGGLE);
    if (toggle) {
      blocks.push({ id: blockId(), type: "toggle", text: toggle[2], indent: indentOf(toggle[1]) });
      continue;
    }

    const todo = line.match(TODO);
    if (todo) {
      blocks.push({
        id: blockId(),
        type: "todo",
        text: todo[3],
        indent: indentOf(todo[1]),
        checked: todo[2].toLowerCase() === "x",
      });
      continue;
    }

    const numbered = line.match(NUMBERED);
    if (numbered) {
      blocks.push({ id: blockId(), type: "numbered", text: numbered[2], indent: indentOf(numbered[1]) });
      continue;
    }

    const bullet = line.match(BULLET);
    if (bullet) {
      blocks.push({ id: blockId(), type: "bullet", text: bullet[2], indent: indentOf(bullet[1]) });
      continue;
    }

    blocks.push({ id: blockId(), type: "paragraph", text: line, indent: 0 });
  }

  if (!blocks.length) blocks.push(emptyBlock());
  return blocks;
}

/* --------------------------------------------------------------- serializing */

export function serializeBlocks(blocks: Block[]): string {
  const lines: string[] = [];
  // Ordinals restart whenever a numbered run is broken or changes depth.
  const ordinals = new Map<number, number>();

  blocks.forEach((block, index) => {
    const pad = "  ".repeat(LIST_TYPES.includes(block.type) ? block.indent : 0);
    if (block.type !== "numbered") {
      ordinals.clear();
    } else {
      const previous = blocks[index - 1];
      if (!previous || previous.type !== "numbered" || previous.indent < block.indent) {
        ordinals.set(block.indent, 1);
      } else {
        ordinals.set(block.indent, (ordinals.get(block.indent) ?? 0) + 1);
      }
      for (const depth of [...ordinals.keys()]) if (depth > block.indent) ordinals.delete(depth);
    }

    switch (block.type) {
      case "h1":
        lines.push(`# ${block.text}`);
        break;
      case "h2":
        lines.push(`## ${block.text}`);
        break;
      case "h3":
        lines.push(`### ${block.text}`);
        break;
      case "bullet":
        lines.push(`${pad}- ${block.text}`);
        break;
      case "numbered":
        lines.push(`${pad}${ordinals.get(block.indent) ?? 1}. ${block.text}`);
        break;
      case "todo":
        lines.push(`${pad}- [${block.checked ? "x" : " "}] ${block.text}`);
        break;
      case "toggle":
        lines.push(`${pad}- [>] ${block.text}`);
        break;
      case "quote":
        lines.push(`> ${block.text}`);
        break;
      case "callout":
        lines.push(`> [!${block.emoji || "💡"}] ${block.text}`);
        break;
      case "divider":
        lines.push("---");
        break;
      case "code":
        lines.push(`\`\`\`${block.lang ?? ""}`, ...block.text.split("\n"), "```");
        break;
      case "tasks":
      case "goal":
      case "db":
        lines.push(`::${block.type}${block.text.trim() ? ` ${block.text.trim()}` : ""}`);
        break;
      default:
        lines.push(block.text);
    }
  });

  return lines.join("\n");
}

/** The plain text of a block, as "line → task" and previews want to read it. */
export function blockPlainText(block: Block): string {
  return block.text
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\[([^\]]+)\]\([^)\s]+\)/g, "$1")
    .trim();
}

/* ------------------------------------------------------- inline rendering --
   Rendering has to report, for every visible character, which raw character it
   came from. Clicking rendered text then lands the caret on the right offset in
   the Markdown source once the block swaps to its editable raw form. */

export interface InlineRender {
  html: string;
  /** map[visibleIndex] = raw index. Length is visible length + 1. */
  map: number[];
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const RULES: { re: RegExp; kind: string }[] = [
  { re: /^`([^`\n]+)`/, kind: "code" },
  { re: /^\*\*([^*\n]+)\*\*/, kind: "strong" },
  { re: /^~~([^~\n]+)~~/, kind: "strike" },
  { re: /^\*([^*\n]+)\*/, kind: "em" },
  { re: /^\[\[([^\]\n]+)\]\]/, kind: "wikilink" },
  { re: /^\[([^\]\n]+)\]\(([^)\s]+)\)/, kind: "link" },
  { re: /^(https?:\/\/[^\s<]+)/, kind: "url" },
  { re: /^#([\p{L}\d_-]+)/u, kind: "tag" },
];

export function renderInline(raw: string, links: Map<string, string> = new Map()): InlineRender {
  const html: string[] = [];
  const map: number[] = [];

  const pushVisible = (text: string, rawStart: number) => {
    html.push(escapeHtml(text));
    for (let i = 0; i < text.length; i += 1) map.push(rawStart + i);
  };

  const walk = (start: number, end: number) => {
    let i = start;
    let plainFrom = i;

    const flush = (until: number) => {
      if (until > plainFrom) pushVisible(raw.slice(plainFrom, until), plainFrom);
    };

    while (i < end) {
      const rest = raw.slice(i, end);
      let matched = false;

      for (const rule of RULES) {
        // `#tag` only counts at a word start, so `C#` and `a#b` stay literal.
        if (rule.kind === "tag" && i > 0 && !/\s/.test(raw[i - 1])) continue;
        if (rule.kind === "url" && i > 0 && !/\s/.test(raw[i - 1])) continue;

        const match = rest.match(rule.re);
        if (!match) continue;
        flush(i);

        const whole = match[0];
        const inner = match[1] ?? "";
        const innerStart = i + whole.indexOf(inner);

        switch (rule.kind) {
          case "code":
            html.push("<code>");
            pushVisible(inner, innerStart);
            html.push("</code>");
            break;
          case "strong":
            html.push("<strong>");
            walk(innerStart, innerStart + inner.length);
            html.push("</strong>");
            break;
          case "strike":
            html.push("<s>");
            walk(innerStart, innerStart + inner.length);
            html.push("</s>");
            break;
          case "em":
            html.push("<em>");
            walk(innerStart, innerStart + inner.length);
            html.push("</em>");
            break;
          case "wikilink": {
            const target = links.get(inner.trim().toLowerCase());
            html.push(
              target
                ? `<a class="nb-page-link" href="/notes/${target}" data-note="${target}">`
                : `<span class="nb-page-link nb-page-missing" title="No page with this title yet">`,
            );
            pushVisible(inner, innerStart);
            html.push(target ? "</a>" : "</span>");
            break;
          }
          case "link": {
            const href = escapeHtml(match[2]);
            html.push(`<a href="${href}" target="_blank" rel="noreferrer">`);
            pushVisible(inner, innerStart);
            html.push("</a>");
            break;
          }
          case "url":
            html.push(`<a href="${escapeHtml(inner)}" target="_blank" rel="noreferrer">`);
            pushVisible(inner, innerStart);
            html.push("</a>");
            break;
          case "tag":
            html.push('<span class="nb-tag">');
            pushVisible(whole, i);
            html.push("</span>");
            break;
        }

        i += whole.length;
        plainFrom = i;
        matched = true;
        break;
      }

      if (!matched) i += 1;
    }

    flush(end);
    plainFrom = end;
  };

  walk(0, raw.length);
  map.push(raw.length);
  return { html: html.join(""), map };
}

/* ------------------------------------------------------------- slash menu -- */

export interface SlashCommand {
  key: string;
  label: string;
  hint: string;
  keywords: string[];
  /** Handled by the editor rather than by a plain type change. */
  action?: "subpage" | "link" | "task" | "database";
  type?: BlockType;
  emoji?: string;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { key: "text", label: "Text", hint: "Plain paragraph", keywords: ["text", "paragraph", "p"], type: "paragraph" },
  { key: "h1", label: "Heading 1", hint: "Big section heading", keywords: ["h1", "heading", "title"], type: "h1" },
  { key: "h2", label: "Heading 2", hint: "Medium section heading", keywords: ["h2", "heading"], type: "h2" },
  { key: "h3", label: "Heading 3", hint: "Small section heading", keywords: ["h3", "heading"], type: "h3" },
  { key: "bullet", label: "Bulleted list", hint: "Simple bullets", keywords: ["bullet", "list", "ul"], type: "bullet" },
  { key: "numbered", label: "Numbered list", hint: "Ordered steps", keywords: ["number", "ordered", "ol"], type: "numbered" },
  { key: "todo", label: "To-do list", hint: "Checkbox you can tick", keywords: ["todo", "task", "check", "box"], type: "todo" },
  { key: "toggle", label: "Toggle list", hint: "Collapsible section", keywords: ["toggle", "collapse", "fold"], type: "toggle" },
  { key: "quote", label: "Quote", hint: "Set a passage apart", keywords: ["quote", "blockquote"], type: "quote" },
  { key: "callout", label: "Callout", hint: "Highlight with an emoji", keywords: ["callout", "note", "info", "tip"], type: "callout", emoji: "💡" },
  { key: "code", label: "Code", hint: "Monospaced block", keywords: ["code", "snippet", "pre"], type: "code" },
  { key: "divider", label: "Divider", hint: "Horizontal rule", keywords: ["divider", "hr", "line", "separator"], type: "divider" },
  { key: "tasks", label: "Task list", hint: "Live tasks from this page's project", keywords: ["task", "todo", "list", "embed"], type: "tasks" },
  { key: "database", label: "Database", hint: "Table, board and calendar in one", keywords: ["database", "table", "board", "grid", "db"], action: "database" },
  { key: "subpage", label: "Sub-page", hint: "New page nested in this one", keywords: ["page", "sub", "child", "nested"], action: "subpage" },
  { key: "link", label: "Link to page", hint: "Reference another note", keywords: ["link", "mention", "ref"], action: "link" },
  { key: "task", label: "Turn into task", hint: "Send this line to Tasks", keywords: ["task", "todo", "growly"], action: "task" },
];

export function filterSlash(query: string): SlashCommand[] {
  const q = query.trim().toLowerCase();
  if (!q) return SLASH_COMMANDS;
  return SLASH_COMMANDS.filter(
    (command) =>
      command.label.toLowerCase().includes(q) ||
      command.keywords.some((keyword) => keyword.startsWith(q)),
  );
}

/* ----------------------------------------------------- markdown shortcuts -- */

/** Prefixes that convert a block the moment you type the trailing space. */
const SHORTCUTS: { prefix: string; type: BlockType; checked?: boolean; emoji?: string }[] = [
  { prefix: "#", type: "h1" },
  { prefix: "##", type: "h2" },
  { prefix: "###", type: "h3" },
  { prefix: "-", type: "bullet" },
  { prefix: "*", type: "bullet" },
  { prefix: "+", type: "bullet" },
  { prefix: "1.", type: "numbered" },
  { prefix: "1)", type: "numbered" },
  { prefix: "[]", type: "todo", checked: false },
  { prefix: "[ ]", type: "todo", checked: false },
  { prefix: "[x]", type: "todo", checked: true },
  { prefix: ">>", type: "toggle" },
  { prefix: ">", type: "quote" },
  { prefix: "|", type: "callout", emoji: "💡" },
  { prefix: "```", type: "code" },
  { prefix: "---", type: "divider" },
];

export function matchShortcut(textBeforeCaret: string) {
  return SHORTCUTS.find((shortcut) => shortcut.prefix === textBeforeCaret);
}
