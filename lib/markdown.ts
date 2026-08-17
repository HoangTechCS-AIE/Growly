/** A small Markdown subset renderer: enough for notes, no dependency. */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inline(text: string, links: Map<string, string>): string {
  let out = escapeHtml(text);
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  out = out.replace(/~~([^~]+)~~/g, "<s>$1</s>");
  out = out.replace(
    /\[\[([^\]]+)\]\]/g,
    (_, title: string) => {
      const id = links.get(title.trim().toLowerCase());
      return id
        ? `<a href="/notes/${id}">${title}</a>`
        : `<span class="text-muted underline decoration-dotted" title="No note with this title yet">${title}</span>`;
    },
  );
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
  out = out.replace(/(^|\s)(https?:\/\/[^\s<]+)/g, '$1<a href="$2">$2</a>');
  out = out.replace(/(^|\s)#([\w-]+)/g, '$1<span class="chip chip-plain">#$2</span>');
  return out;
}

export function renderMarkdown(source: string, noteLinks: Map<string, string> = new Map()): string {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let list: "ul" | "ol" | null = null;
  let inCode = false;

  const closeList = () => {
    if (list) {
      html.push(`</${list}>`);
      list = null;
    }
  };

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      closeList();
      html.push(inCode ? "</code></pre>" : "<pre><code>");
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      html.push(`${escapeHtml(line)}\n`);
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${inline(heading[2], noteLinks)}</h${level}>`);
      continue;
    }

    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      closeList();
      html.push("<hr />");
      continue;
    }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      closeList();
      html.push(`<blockquote>${inline(quote[1], noteLinks)}</blockquote>`);
      continue;
    }

    const todo = line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.*)$/);
    if (todo) {
      if (list !== "ul") {
        closeList();
        html.push('<ul class="list-none pl-0">');
        list = "ul";
      }
      const checked = todo[1].toLowerCase() === "x";
      html.push(
        `<li class="flex items-start gap-2 ${checked ? "text-muted line-through" : ""}">` +
          `<span class="mt-[3px] inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
            checked ? "border-accent bg-accent text-accent-ink" : "border-line-strong"
          }">${checked ? "✓" : ""}</span><span>${inline(todo[2], noteLinks)}</span></li>`,
      );
      continue;
    }

    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      if (list !== "ul") {
        closeList();
        html.push("<ul>");
        list = "ul";
      }
      html.push(`<li>${inline(bullet[1], noteLinks)}</li>`);
      continue;
    }

    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (numbered) {
      if (list !== "ol") {
        closeList();
        html.push("<ol>");
        list = "ol";
      }
      html.push(`<li>${inline(numbered[1], noteLinks)}</li>`);
      continue;
    }

    if (!line.trim()) {
      closeList();
      continue;
    }

    closeList();
    html.push(`<p>${inline(line, noteLinks)}</p>`);
  }

  closeList();
  if (inCode) html.push("</code></pre>");
  return html.join("\n");
}

export const NOTE_TEMPLATES: { key: string; label: string; title: string; content: string }[] = [
  {
    key: "weekly-review",
    label: "Weekly review",
    title: "Weekly review",
    content: `## What moved forward\n- \n\n## What stalled, and why\n- \n\n## Goals: still the right ones?\n- \n\n## Strategy adjustments for next week\n- \n\n## Top 3 for next week\n1. \n2. \n3. \n`,
  },
  {
    key: "brainstorm",
    label: "Brainstorming",
    title: "Brainstorm",
    content: `## Question\n\n## Raw ideas (no filtering)\n- \n\n## Worth testing\n- \n\n## Next step\n- \n`,
  },
  {
    key: "planning",
    label: "Planning",
    title: "Planning session",
    content: `## Outcome I want\n\n## Constraints\n- \n\n## Options\n1. \n\n## Decision\n\n## First actions\n- \n`,
  },
  {
    key: "meeting",
    label: "Meeting",
    title: "Meeting",
    content: `**Date:** \n**With:** \n\n## Context\n\n## Discussion\n- \n\n## Decisions\n- \n\n## Action items\n- [ ] \n`,
  },
  {
    key: "project",
    label: "Project note",
    title: "Project note",
    content: `## Goal of this project\n\n## Research\n- \n\n## Decisions and why\n- \n\n## Open questions\n- \n`,
  },
];
