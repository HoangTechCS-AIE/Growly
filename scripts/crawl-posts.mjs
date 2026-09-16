/**
 * Crawls the fanpage archive into `data/<post_id>/post.json`.
 *
 * Reads the page through the Graph API, which needs a Page access token — see
 * the crawl section of the README. Writes exactly the shape `import-posts.mjs`
 * expects and nothing else; media files stay on Facebook, only the count is kept.
 *
 * Run with `npm run crawl:posts`. Safe to re-run: each post overwrites its own
 * file, so a second pass picks up edits and new posts without touching the rest.
 *
 *   npm run crawl:posts -- --since=2024-01-01   only posts from that date on
 *   npm run crawl:posts -- --max=200            stop after N posts
 *   npm run crawl:posts -- --dry-run            fetch and report, write nothing
 */
import dns from "node:dns";
import fs from "node:fs";
import path from "node:path";

/* graph.facebook.com is dual-stack, and Node's default "verbatim" order tries
   the AAAA record first. On a host without working IPv6 the connection sits
   there until it times out instead of falling back, so fetch fails where curl
   to the same address succeeds. Ask for A records first. */
dns.setDefaultResultOrder("ipv4first");

const VERSION = process.env.FB_API_VERSION ?? "v21.0";
const pageId = process.env.FB_PAGE_ID;
const token = process.env.FB_PAGE_TOKEN;
const outDir = process.env.GROWLY_CORPUS ?? path.join(process.cwd(), "data");

function flag(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}
const since = flag("since");
const until = flag("until");
const max = Number(flag("max") ?? Infinity);
const dryRun = process.argv.includes("--dry-run");

if (!pageId || !token) {
  console.error(
    "Thiếu FB_PAGE_ID hoặc FB_PAGE_TOKEN trong .env — xem mục crawl trong README.",
  );
  process.exit(1);
}

/* `type` and `status_type` were dropped from the Graph API after v3.3, so the
   post kind is inferred from the attachment instead. Both columns are nullable
   in `fb_posts`, and the category comes from the text anyway. */
const FIELDS = "id,message,created_time,permalink_url,attachments{media_type}";

function firstPage() {
  const url = new URL(`https://graph.facebook.com/${VERSION}/${pageId}/published_posts`);
  url.searchParams.set("fields", FIELDS);
  url.searchParams.set("limit", "100");
  url.searchParams.set("access_token", token);
  if (since) url.searchParams.set("since", since);
  if (until) url.searchParams.set("until", until);
  return url.toString();
}

/* The route to Facebook drops connections often enough that a few-thousand-post
   crawl will not survive a single attempt per page. Network failures retry;
   a Graph API error (bad token, rate limit) is an answer, so it does not. */
async function fetchOnce(url, attempt) {
  try {
    return await fetch(url);
  } catch (err) {
    const code = err.cause?.code ?? err.message;
    if (attempt >= 4) throw new Error(`Không gọi được Graph API sau 4 lần thử — ${code}`);
    const wait = attempt * 1000;
    console.error(`  ... lần ${attempt} lỗi (${code}), thử lại sau ${wait / 1000}s`);
    await new Promise((r) => setTimeout(r, wait));
    return fetchOnce(url, attempt + 1);
  }
}

async function fetchPage(url) {
  const res = await fetchOnce(url, 1);
  const body = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error(`Graph API trả về JSON không hợp lệ: ${body.slice(0, 200)}`);
  }
  if (parsed.error) {
    const e = parsed.error;
    throw new Error(`Graph API ${e.code ?? "?"}: ${e.message ?? body.slice(0, 200)}`);
  }
  return parsed;
}

let url = firstPage();
let written = 0;
let noText = 0;
let pages = 0;
let oldest = null;
let newest = null;

try {
  while (url && written < max) {
    const page = await fetchPage(url);
    pages += 1;

    for (const post of page.data ?? []) {
      if (written >= max) break;
      const message = (post.message ?? "").trim();
      // Photo-only posts teach nothing about the voice; the importer skips them too.
      if (!message) {
        noText += 1;
        continue;
      }

      const record = {
        id: post.id,
        message: post.message,
        created_time: post.created_time ?? "",
        permalink_url: post.permalink_url ?? null,
        media: (post.attachments?.data ?? []).map((a) => ({ media_type: a.media_type ?? null })),
      };

      const date = record.created_time.slice(0, 10);
      if (date) {
        if (!oldest || date < oldest) oldest = date;
        if (!newest || date > newest) newest = date;
      }

      if (!dryRun) {
        const dir = path.join(outDir, post.id);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, "post.json"), `${JSON.stringify(record, null, 2)}\n`);
      }
      written += 1;
    }

    // Without this the run is silent until the last page, which on a big archive
    // is indistinguishable from a hang.
    console.log(`  trang ${pages}: ${written} bài, tới ${oldest ?? "?"}`);

    url = page.paging?.next ?? null;
    // The page-level rate limit is generous, but a crawl of a few thousand posts
    // walks straight into it without a pause between pages.
    if (url && written < max) await new Promise((r) => setTimeout(r, 300));
  }
} catch (err) {
  // An expired token or a rate limit is an ordinary outcome here, not a crash —
  // posts already written stay on disk and a re-run picks up where this stopped.
  console.error(err.message);
  console.error(`Đã ghi ${written} bài trước khi dừng. Chạy lại để tiếp tục.`);
  process.exit(1);
}

console.log(
  `${dryRun ? "Would write" : "Wrote"} ${written} post(s) từ ${pages} trang, bỏ qua ${noText} bài không có text.`,
);
if (newest) console.log(`Range: ${oldest} → ${newest}`);
if (!dryRun && written > 0) console.log(`Giờ chạy: npm run import:posts`);
