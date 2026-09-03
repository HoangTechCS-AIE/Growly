/**
 * The 15-point checklist from `docs/hit-content-rules.md` §12, as code.
 *
 * Pure and dependency-free so both the server action and the browser can run it —
 * the studio re-lints on every keystroke while you edit a draft.
 */

import {
  BANNED_EMOJI,
  BANNED_PHRASES,
  BANNED_PRONOUNS,
  PARTICLES,
  SELF_PRONOUNS,
  TARGET,
} from "./rules";

export type Severity = "fail" | "warn";

export interface Check {
  id: string;
  label: string;
  ok: boolean;
  severity: Severity;
  detail: string;
}

export interface LintOptions {
  /**
   * The string that marks the footer block — the club name, from `.env`.
   * Passed in rather than baked in so the linter is not tied to one page.
   */
  footerMarker?: string;
}

export interface LintResult {
  checks: Check[];
  score: number;
  failed: number;
  warned: number;
}

/*
 * Emoji, minus the variation selector and keycap combiner that ride along.
 * Kept as two constants on purpose: `.test()` against a /g/ regex advances
 * lastIndex and alternates true/false on identical input.
 */
const EMOJI_SRC =
  "[\\u{1F000}-\\u{1FAFF}\\u{2190}-\\u{21FF}\\u{2300}-\\u{23FF}\\u{2460}-\\u{24FF}\\u{25A0}-\\u{27BF}\\u{2B00}-\\u{2BFF}]";
const EMOJI_G = new RegExp(EMOJI_SRC, "gu");
const EMOJI_AT_START = new RegExp(`^${EMOJI_SRC}`, "u");
const EMOJI_AT_END = new RegExp(`${EMOJI_SRC}[\\uFE0F\\u20E3\\s]*$`, "u");
const EMOJI_HEAD_RE = new RegExp(`^(?:${EMOJI_SRC}|\\uFE0F|\\u20E3|\\s)+`, "u");

export function countEmoji(text: string): number {
  return (text.match(EMOJI_G) ?? []).length;
}

function contentLines(text: string): string[] {
  return text.split("\n").filter((l) => l.trim().length > 0);
}

function isSeparator(line: string): boolean {
  const t = line.trim();
  return t.length >= 15 && new Set(t).size <= 3;
}

function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Strips the footer block so body checks do not count boilerplate. */
export function stripFooter(text: string, marker: string): string {
  if (!marker) return text;
  const idx = text.indexOf(marker);
  if (idx < 0) return text;
  const before = text.slice(0, idx);
  const cut = before.lastIndexOf("\n");
  return cut > 0 ? before.slice(0, cut) : before;
}

function check(
  id: string,
  label: string,
  ok: boolean,
  detail: string,
  severity: Severity = "fail",
): Check {
  return { id, label, ok, severity, detail };
}

export function lintPost(raw: string, options: LintOptions = {}): LintResult {
  const marker = options.footerMarker ?? "";
  const text = raw.trim();
  const lines = contentLines(text);
  const body = stripFooter(text, marker).trim();
  const bodyParas = paragraphs(body);
  const emoji = countEmoji(text);
  const checks: Check[] = [];

  /* 1 — length */
  const len = text.length;
  checks.push(
    check(
      "length",
      "Độ dài bài",
      len >= TARGET.charsMin && len <= TARGET.charsHardMax,
      len < TARGET.charsMin
        ? `${len} ký tự — ngắn hơn mức tối thiểu ${TARGET.charsMin}`
        : len > TARGET.charsHardMax
          ? `${len} ký tự — vượt trần ${TARGET.charsHardMax}`
          : len > TARGET.charsMax
            ? `${len} ký tự — trên mục tiêu ${TARGET.charsMax} nhưng còn dưới trần`
            : `${len} ký tự`,
      len > TARGET.charsMax && len <= TARGET.charsHardMax ? "warn" : "fail",
    ),
  );

  /* 2 — paragraph shape.
     Dots inside URLs read as sentence ends, and a multi-line block is a list
     rather than a run-on paragraph — exclude both before counting. */
  const sentencesIn = (p: string) =>
    p
      .replace(/https?:\/\/\S+/g, " ")
      .split(/[.!?‼️⁉️❓]+/)
      .filter((s) => s.trim().length > 12).length;
  const longPara = bodyParas.find(
    (p) =>
      p.split("\n").length <= 2 && sentencesIn(p) > TARGET.sentencesPerParagraphHard,
  );
  checks.push(
    check(
      "paragraphs",
      "Đoạn ngắn",
      bodyParas.length <= TARGET.paragraphsMax && !longPara,
      longPara
        ? `Có đoạn dài quá ${TARGET.sentencesPerParagraphHard} câu: "${longPara.slice(0, 48)}…"`
        : `${bodyParas.length} đoạn, ${lines.length} dòng có chữ`,
      "warn",
    ),
  );

  /* 3 — title */
  const title = lines[0] ?? "";
  const titleLetters = title.replace(EMOJI_G, "").replace(/[^\p{L}]/gu, "");
  const upperShare =
    titleLetters.length > 0
      ? [...titleLetters].filter((c) => c === c.toUpperCase()).length / titleLetters.length
      : 0;
  const emojiBothEnds = EMOJI_HEAD_RE.test(title) && EMOJI_AT_END.test(title);
  checks.push(
    check(
      "title",
      "Tiêu đề IN HOA + emoji hai đầu",
      upperShare >= 0.6 && emojiBothEnds,
      upperShare < 0.6
        ? `Tiêu đề chưa IN HOA (${Math.round(upperShare * 100)}% chữ hoa)`
        : emojiBothEnds
          ? title.slice(0, 60)
          : "Thiếu emoji kẹp ở một trong hai đầu",
    ),
  );

  /* 4 — separator */
  const seps = lines.filter(isSeparator).length;
  checks.push(
    check("separator", "Có dòng gạch ngang", seps >= 1, `${seps} separator`, "fail"),
  );

  /* 5 — emoji budget */
  checks.push(
    check(
      "emoji-count",
      "Số lượng emoji",
      emoji >= TARGET.emojiMin && emoji <= TARGET.emojiMax,
      `${emoji} emoji (mục tiêu ${TARGET.emojiMin}–${TARGET.emojiMax})`,
      "warn",
    ),
  );

  /* 6 — emoji sit at line heads, never sprinkled mid-sentence */
  const headed = lines.filter((l) => EMOJI_AT_START.test(l.trim())).length;
  const share = lines.length > 0 ? headed / lines.length : 0;
  checks.push(
    check(
      "emoji-position",
      "Emoji đứng đầu dòng",
      share >= TARGET.emojiLineShare,
      `${headed}/${lines.length} dòng (${Math.round(share * 100)}%, cần ≥${Math.round(
        TARGET.emojiLineShare * 100,
      )}%)`,
    ),
  );

  /* 6b — banned emoji */
  const badEmoji = BANNED_EMOJI.filter((e) => text.includes(e));
  checks.push(
    check(
      "emoji-palette",
      "Không dùng emoji mùi AI",
      badEmoji.length === 0,
      badEmoji.length ? `Gặp: ${badEmoji.join(" ")}` : "Đúng bảng màu của page",
      "warn",
    ),
  );

  /* 7 — one self-pronoun, not two */
  const used = SELF_PRONOUNS.filter((p) => new RegExp(p, "i").test(text));
  checks.push(
    check(
      "pronoun-mix",
      "Không trộn xưng hô",
      used.length <= 1,
      used.length === 0
        ? "Chưa xưng hô ngôi thứ nhất — nên có ít nhất một lần"
        : used.length === 1
          ? `Dùng nhất quán "${used[0]}"`
          : `Trộn ${used.map((u) => `"${u}"`).join(" và ")}`,
      used.length === 0 ? "warn" : "fail",
    ),
  );

  /* 8 — banned pronouns */
  const badPron = BANNED_PRONOUNS.filter((p) => new RegExp(p.term, "i").test(text));
  checks.push(
    check(
      "pronoun-banned",
      "Không có xưng hô cấm",
      badPron.length === 0,
      badPron.length
        ? badPron.map((p) => `"${p.term}" (${p.why})`).join("; ")
        : "Không có chúng tôi / quý vị / bạn nhé",
    ),
  );

  /* 9 — a question aimed at the reader */
  const hasQuestion = /[?？]|❓|⁉️/.test(text);
  checks.push(
    check(
      "question",
      "Có câu hỏi hướng về người đọc",
      hasQuestion,
      hasQuestion ? "Có" : "Chưa có",
      "warn",
    ),
  );

  /* 10 — sentence-final particles.
     `\b` is ASCII-only: it misses "ơi" (leading non-ASCII letter) and matches
     "nha" inside "nhau". Unicode lookarounds get both right. */
  const found = PARTICLES.filter((p) =>
    new RegExp(`(?<!\\p{L})${p}(?!\\p{L})`, "iu").test(text),
  );
  // 82% of real posts carry at least one particle, but only 58% carry two —
  // so one is the bar, and a lone particle is worth a nudge, not a failure.
  checks.push(
    check(
      "particles",
      "Tiểu từ cuối câu",
      found.length >= 1,
      found.length === 0
        ? "Không có tiểu từ nào (nhé / nha / nào / ơi)"
        : found.length === 1
          ? `Chỉ có "${found[0]}" — thêm một tiểu từ nữa sẽ tự nhiên hơn`
          : found.join(", "),
      found.length === 1 ? "warn" : "fail",
    ),
  );

  /* 11 — stretched vowels. Only 21% of real posts do it, but models do it ~never,
     so it is a strong positive signal and a weak negative one: warn, never fail. */
  const prose = body
    .split("\n")
    .filter((l) => !isSeparator(l))
    .join("\n")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\bwww\S*/gi, " ");
  const stretched = prose.match(/[\p{L}]*(\p{L})\1{2,}[\p{L}]*/gu) ?? [];
  checks.push(
    check(
      "elongation",
      "Kéo dài nguyên âm",
      stretched.length >= 1,
      stretched.length
        ? stretched.join(", ")
        : "Chưa có chỗ nào — thêm 1 chỗ (nhaaa / thoiii) là dấu người thật rõ nhất",
      "warn",
    ),
  );

  /* 12 — concrete detail */
  const hard =
    (body.match(/\d{1,2}\/\d{1,2}/g) ?? []).length +
    (body.match(/https?:\/\//g) ?? []).length +
    (body.match(/\d{1,2}h\d{0,2}\b/g) ?? []).length;
  checks.push(
    check(
      "concrete",
      "Có chi tiết cứng",
      hard >= 2,
      `${hard} mốc (ngày / giờ / link) — bài chung chung là dấu hiệu AI`,
      "warn",
    ),
  );

  /* 13 — essay connectives */
  const badPhrase = BANNED_PHRASES.filter((p) => new RegExp(p, "i").test(text));
  checks.push(
    check(
      "phrases",
      "Không có từ nối văn nghị luận",
      badPhrase.length === 0,
      badPhrase.length ? badPhrase.map((p) => `"${p}"`).join(", ") : "Sạch",
    ),
  );

  /* 14 — formatting tells */
  const tells: string[] = [];
  // Separator lines are legitimately drawn with em dashes — judge prose only.
  const proseLines = text.split("\n").filter((l) => !isSeparator(l)).join("\n");
  if (/\*\*|^#{1,6}\s/m.test(text)) tells.push("markdown");
  if (/—/.test(proseLines)) tells.push("em dash —");
  if (/…/.test(text)) tells.push("ellipsis …");
  // The page bullets with "-" (15% of posts) or an emoji, never with these:
  // • shows up in 2/505 real posts, ‣ ▪ ● in none.
  const bullet = proseLines.match(/^[ \t]*([•‣▪●○◦])/m);
  if (bullet) tells.push(`bullet ${bullet[1]} (page dùng "-" hoặc emoji)`);
  checks.push(
    check(
      "formatting",
      "Không có dấu vết markdown / em dash",
      tells.length === 0,
      tells.length ? `Gặp: ${tells.join(", ")}` : "Sạch",
    ),
  );

  /* 15 — footer and hashtags */
  const hasFooter = marker.length > 0 && text.includes(marker);
  const tagCount = (text.match(/#[^\s#]+/g) ?? []).length;
  checks.push(
    check(
      "footer",
      "Footer + hashtag",
      marker.length === 0
        ? tagCount > 0 && tagCount <= TARGET.hashtagsMax
        : hasFooter && tagCount > 0 && tagCount <= TARGET.hashtagsMax,
      marker.length === 0
        ? "Chưa cấu hình CLUB_NAME trong .env — chỉ kiểm tra được hashtag"
        : !hasFooter
          ? "Thiếu footer (bắt buộc với bài chính thức — 90% bài 2025 có)"
          : tagCount === 0
            ? "Thiếu hashtag"
            : tagCount > TARGET.hashtagsMax
              ? `${tagCount} hashtag — quá ${TARGET.hashtagsMax}`
              : `Đủ footer, ${tagCount} hashtag`,
      hasFooter || marker.length === 0 ? "warn" : "fail",
    ),
  );

  const failed = checks.filter((c) => !c.ok && c.severity === "fail").length;
  const warned = checks.filter((c) => !c.ok && c.severity === "warn").length;
  const passed = checks.filter((c) => c.ok).length;
  return { checks, score: Math.round((passed / checks.length) * 100), failed, warned };
}

/**
 * Mechanical repairs only — the ones with exactly one right answer.
 * Anything needing judgement stays a lint warning for a human to resolve.
 */
export function autofix(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/—/g, "-")
    .replace(/…/g, "...")
    .replace(/^([ \t]*)[•‣▪●○◦][ \t]*/gm, "$1- ")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
