/**
 * Calibration harness for the content linter.
 *
 * Runs `lintPost` over every real post already imported into `fb_posts` and
 * reports the score distribution. The corpus IS the ground truth, so if genuine
 * 2025–2026 posts score badly the linter is wrong, not the posts.
 *
 * Run with `npm run lint:corpus` (compiles lib/ to .smoke/ first).
 */
const Module = require("node:module");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

// The data layer targets the Next.js server runtime; stub the import that only
// exists there before loading anything out of .smoke/.
const STUB = path.join(__dirname, "stub.js");
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === "server-only" || request === "next/cache") return STUB;
  return resolveFilename.call(this, request, ...rest);
};

const { lintPost } = require(path.join(process.cwd(), ".smoke", "content", "lint.js"));
const { clubConfig } = require(path.join(process.cwd(), ".smoke", "config.js"));

const { footerMarker } = clubConfig();
if (!footerMarker) {
  console.error("CLUB_NAME chưa được đặt trong .env — bộ chấm không nhận ra footer.");
  process.exit(1);
}

const dbPath = process.env.GROWLY_DB ?? path.join(process.cwd(), "data", "growly.db");
if (!fs.existsSync(dbPath)) {
  console.error(`No database at ${dbPath} — run "npm run import:posts" first.`);
  process.exit(1);
}

const db = new DatabaseSync(dbPath, { timeout: 5000 });
const posts = db
  .prepare("SELECT id, date, category, message FROM fb_posts ORDER BY date")
  .all();

if (posts.length === 0) {
  console.error('No rows in fb_posts — run "npm run import:posts" first.');
  process.exit(1);
}

const failCount = new Map();
const modernFail = new Map();
const scores = [];
const modern = [];

for (const post of posts) {
  const result = lintPost(post.message, { footerMarker });
  const isModern = post.date >= "2025-01-01";
  scores.push(result.score);
  if (isModern) modern.push(result.score);
  for (const check of result.checks) {
    if (check.ok) continue;
    const key = `${check.severity}:${check.id}`;
    failCount.set(key, (failCount.get(key) ?? 0) + 1);
    if (isModern) modernFail.set(key, (modernFail.get(key) ?? 0) + 1);
  }
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const mean = (xs) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);

console.log(`Linted ${posts.length} real posts.`);
console.log(`  toàn kỳ      median ${median(scores)}  mean ${mean(scores)}`);
console.log(`  từ 2025      median ${median(modern)}  mean ${mean(modern)}  (n=${modern.length})`);

const buckets = { "90-100": 0, "80-89": 0, "70-79": 0, "<70": 0 };
for (const s of scores) {
  if (s >= 90) buckets["90-100"] += 1;
  else if (s >= 80) buckets["80-89"] += 1;
  else if (s >= 70) buckets["70-79"] += 1;
  else buckets["<70"] += 1;
}
console.log("\nPhân bố điểm (toàn kỳ):");
for (const [range, n] of Object.entries(buckets)) {
  console.log(`  ${range.padEnd(8)} ${String(n).padStart(4)}  ${Math.round((n / scores.length) * 100)}%`);
}

console.log("\nTiêu chí hay trượt — toàn kỳ:");
for (const [key, n] of [...failCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
  console.log(`  ${String(n).padStart(4)}/${posts.length}  ${key}`);
}

// The 2025+ slice is the real calibration target: the page only standardised
// its format in 2024, so older posts fail footer/separator by design.
console.log("\nTiêu chí hay trượt — chỉ 2025+ (đây mới là chuẩn):");
for (const [key, n] of [...modernFail.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
  console.log(`  ${String(n).padStart(4)}/${modern.length}  ${key}`);
}
