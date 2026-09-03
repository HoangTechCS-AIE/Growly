import "server-only";

/**
 * Every deployment-specific value lives in `.env` — see `.env.example` for the
 * full list. Nothing here carries a baked-in club name, endpoint or key, so the
 * Content feature works for any page without touching the source.
 *
 * Server-only on purpose: these are read during render or inside server
 * actions, then handed to client components as props. Never import this from a
 * `"use client"` file — non-`NEXT_PUBLIC_` variables are undefined there.
 */

function str(name: string, fallback = ""): string {
  return (process.env[name] ?? "").trim() || fallback;
}

function num(name: string, fallback: number): number {
  const raw = (process.env[name] ?? "").trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export interface ClubConfig {
  name: string;
  short: string;
  founded: string;
  fanpage: string;
  website: string;
  email: string;
  address: string;
  hashtags: string[];
  /** What the page calls its members ("HITers"). Blank if the club has no such word. */
  memberTerm: string;
  /**
   * The string the linter looks for to decide a post carries the footer.
   * Defaults to the part of CLUB_NAME before " - ", i.e. the club's own name
   * without the university suffix, which is the distinctive half.
   */
  footerMarker: string;
}

export function clubConfig(): ClubConfig {
  const name = str("CLUB_NAME");
  return {
    name,
    short: str("CLUB_SHORT"),
    founded: str("CLUB_FOUNDED"),
    fanpage: str("CLUB_FANPAGE"),
    website: str("CLUB_WEBSITE"),
    email: str("CLUB_EMAIL"),
    address: str("CLUB_ADDRESS"),
    hashtags: str("CLUB_HASHTAGS").split(/\s+/).filter(Boolean),
    memberTerm: str("CLUB_MEMBER_TERM"),
    footerMarker: str("CLUB_FOOTER_MARKER") || name.split(/\s+-\s+/)[0].trim(),
  };
}

/** True once the club identity is filled in; the Content page gates on this. */
export function isClubConfigured(config: ClubConfig = clubConfig()): boolean {
  return Boolean(config.name && config.footerMarker);
}

export interface ContentLimits {
  /** How much of an uploaded document is read. */
  docMaxChars: number;
  /** Seconds to wait on the provider before giving up. */
  requestTimeoutMs: number;
  /** How many real posts are shown to the model as examples. */
  fewShotCount: number;
  /** Posts older than this predate the page's current format. */
  fewShotSince: string;
}

export function contentLimits(): ContentLimits {
  return {
    docMaxChars: num("CONTENT_DOC_MAX_CHARS", 20_000),
    requestTimeoutMs: num("CONTENT_REQUEST_TIMEOUT_MS", 120_000),
    fewShotCount: num("CONTENT_FEWSHOT_COUNT", 3),
    fewShotSince: str("CONTENT_FEWSHOT_SINCE", "2024-01-01"),
  };
}

export interface ProviderDefaults {
  baseUrl: string;
  model: string;
  apiKey: string;
  temperature: number;
  /** Extraction wants literal copying, not invention. */
  extractTemperature: number;
}

export function providerDefaults(): ProviderDefaults {
  return {
    baseUrl: str("OPENAI_BASE_URL"),
    model: str("OPENAI_MODEL"),
    apiKey: str("OPENAI_API_KEY"),
    temperature: num("OPENAI_TEMPERATURE", 0.9),
    extractTemperature: num("OPENAI_EXTRACT_TEMPERATURE", 0),
  };
}

/** The footer block appended to a finished post. */
export function footerBlock(config: ClubConfig, address: string, separator: string): string {
  return [
    separator,
    config.name,
    `📌Fanpage: ${config.fanpage}`,
    `🏢Add: ${address || config.address}`,
    `📮Email: ${config.email}`,
    `✅Website: ${config.website}`,
  ]
    // A club that leaves a field blank should not get a dangling label.
    .filter((line) => !/:\s*$/.test(line))
    .join("\n");
}
