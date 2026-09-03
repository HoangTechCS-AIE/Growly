/**
 * Imports the crawled fanpage archive into `fb_posts`.
 *
 * Reads every `data/<post_id>/post.json`, keeps the message text and the counts,
 * and leaves the media files where they are — the corpus is used for few-shot
 * examples and voice statistics, not for re-uploading anything.
 *
 * Run with `npm run import:posts`. Safe to re-run: rows are upserted by post id.
 */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const dbPath = process.env.GROWLY_DB ?? path.join(root, "data", "growly.db");
const dataDir = process.env.GROWLY_CORPUS ?? path.join(root, "data");

fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath, { timeout: 5000 });
db.exec("PRAGMA foreign_keys = ON;");
db.exec(fs.readFileSync(path.join(root, "lib", "schema.sql"), "utf8"));

/**
 * Keep the keys in step with `Category` in lib/content/rules.ts.
 * First match wins, so the order encodes priority.
 */
const RULES = [
  ["recap", /RECAP|TỔNG KẾT|TONG KET|NHÌN LẠI/i],
  ["tuyen", /TUYỂN|TUYEN|RECRUIT|\bCTV\b|ỨNG VIÊN|VÒNG PHỎNG VẤN/i],
  ["confession", /CONFESSION|\bCFS\b|TÂM TÌNH|KÝ GỬI/i],
  ["thanhtich", /CHÚC MỪNG|THÀNH TÍCH|GIẢI NHẤT|QUÁN QUÂN|VÔ ĐỊCH|HAPPY BIRTHDAY|SINH NHẬT|FLEX/i],
  ["ngayle", /20\/10|8\/3|20\/11|TẾT|GIÁNG SINH|NOEL|QUỐC TẾ PHỤ NỮ|TRUNG THU|NHÀ GIÁO/i],
  ["lophoc", /\bLỚP\b|KHÓA HỌC|KHOÁ HỌC|ĐÀO TẠO|PUBLIC HÈ|GÓC HỌC TẬP/i],
  // Before `sukien`: "THÔNG BÁO OFFLINE THÁNG 4" is an announcement first.
  ["thongbao", /THÔNG BÁO|THONG BAO|LƯU Ý|CÔNG BỐ/i],
  ["sukien", /CONTEST|SEMINAR|WORKSHOP|OPEN DAY|CUỘC THI|SỰ KIỆN|TALKSHOW|OFFLINE|TEAMBUILDING|DU LỊCH|OLYMPIC|ICPC/i],
];

const EMOJI_RE =
  /[\u{1F000}-\u{1FAFF}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{2460}-\u{24FF}\u{25A0}-\u{27BF}\u{2B00}-\u{2BFF}]/gu;

function classify(message) {
  const head = `${message.split("\n")[0]} ${message.slice(0, 400)}`;
  for (const [key, re] of RULES) if (re.test(head)) return key;
  return "khac";
}

const entries = fs
  .readdirSync(dataDir, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => path.join(dataDir, e.name, "post.json"))
  .filter((p) => fs.existsSync(p));

if (entries.length === 0) {
  console.log(`No post.json found under ${dataDir} — nothing to import.`);
  process.exit(0);
}

const upsert = db.prepare(`
  INSERT INTO fb_posts(id, created_time, date, type, status_type, category, message,
                       char_count, emoji_count, media_count, permalink_url, imported_at)
  VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    message = excluded.message, category = excluded.category,
    char_count = excluded.char_count, emoji_count = excluded.emoji_count,
    media_count = excluded.media_count, imported_at = excluded.imported_at`);

const now = new Date().toISOString();
const byCategory = {};
let imported = 0;
let skipped = 0;

db.exec("BEGIN");
try {
  for (const file of entries) {
    let post;
    try {
      post = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      skipped += 1;
      continue;
    }
    const message = (post.message ?? "").trim();
    if (!message) {
      skipped += 1;
      continue;
    }
    const category = classify(message);
    byCategory[category] = (byCategory[category] ?? 0) + 1;
    upsert.run(
      post.id,
      post.created_time ?? "",
      (post.created_time ?? "").slice(0, 10),
      post.type ?? null,
      post.status_type ?? null,
      category,
      message,
      message.length,
      (message.match(EMOJI_RE) ?? []).length,
      Array.isArray(post.media) ? post.media.length : 0,
      post.permalink_url ?? null,
      now,
    );
    imported += 1;
  }
  db.exec("COMMIT");
} catch (err) {
  db.exec("ROLLBACK");
  throw err;
}

const span = db
  .prepare("SELECT MIN(date) AS from_date, MAX(date) AS to_date FROM fb_posts")
  .get();

console.log(`Imported ${imported} post(s), skipped ${skipped} without text.`);
console.log(`Range: ${span.from_date} → ${span.to_date}`);
for (const [key, n] of Object.entries(byCategory).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${key}`);
}
