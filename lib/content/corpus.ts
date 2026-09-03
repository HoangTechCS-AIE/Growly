import "server-only";
import { contentLimits } from "../config";
import { all, get } from "../db";
import type { Category } from "./rules";

export interface CorpusPost {
  id: string;
  date: string;
  category: string;
  message: string;
  char_count: number;
  emoji_count: number;
  media_count: number;
  permalink_url: string | null;
}

export interface CorpusStats {
  total: number;
  from_date: string | null;
  to_date: string | null;
  by_category: { category: string; n: number }[];
}

export function corpusStats(): CorpusStats {
  const head = get<{ n: number; from_date: string | null; to_date: string | null }>(
    "SELECT COUNT(*) AS n, MIN(date) AS from_date, MAX(date) AS to_date FROM fb_posts",
  );
  return {
    total: head?.n ?? 0,
    from_date: head?.from_date ?? null,
    to_date: head?.to_date ?? null,
    by_category: all<{ category: string; n: number }>(
      "SELECT category, COUNT(*) AS n FROM fb_posts GROUP BY category ORDER BY n DESC",
    ),
  };
}

/**
 * Few-shot examples for one category.
 *
 * Recent posts only — the page standardised its format in 2024, so a 2022 post
 * teaches the wrong shape (no footer, no separator). Within that window it takes
 * the ones closest to the median length, since outliers teach the wrong rhythm.
 */
export function examplesFor(category: Category | string, limit?: number): CorpusPost[] {
  const { fewShotCount, fewShotSince } = contentLimits();
  const take = limit ?? fewShotCount;
  const rows = all<CorpusPost>(
    `SELECT id, date, category, message, char_count, emoji_count, media_count, permalink_url
     FROM fb_posts
     WHERE category = ? AND date >= ? AND char_count BETWEEN 600 AND 2400
     ORDER BY ABS(char_count - 1300), date DESC
     LIMIT ?`,
    category,
    fewShotSince,
    take,
  );
  if (rows.length >= take) return rows;

  // Thin category, or an archive that predates the 2024 reformat — widen the net.
  const extra = all<CorpusPost>(
    `SELECT id, date, category, message, char_count, emoji_count, media_count, permalink_url
     FROM fb_posts
     WHERE category = ? AND id NOT IN (${rows.map(() => "?").join(",") || "''"})
     ORDER BY date DESC LIMIT ?`,
    category,
    ...rows.map((r) => r.id),
    take - rows.length,
  );
  return [...rows, ...extra];
}

export function searchCorpus(q: string, limit = 20): CorpusPost[] {
  const term = `%${q.trim()}%`;
  return all<CorpusPost>(
    `SELECT id, date, category, message, char_count, emoji_count, media_count, permalink_url
     FROM fb_posts WHERE message LIKE ? ORDER BY date DESC LIMIT ?`,
    term,
    limit,
  );
}
