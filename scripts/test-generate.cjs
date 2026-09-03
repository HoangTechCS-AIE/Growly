/**
 * End-to-end check of the content pipeline against a stub provider.
 *
 * Spins up a local OpenAI-compatible endpoint, points a throwaway copy of the
 * database at it, and drives `generatePost` for real: prompt assembly, few-shot
 * selection, the repair pass, and the linter verdict. No network, no API key.
 *
 * Run with `npm run test:content`.
 */
const Module = require("node:module");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");

// Scripts do not go through Next's env loading; `--env-file-if-exists` in the
// npm script covers that, and this asserts the values actually arrived.
if (!process.env.CLUB_NAME) {
  console.error("CLUB_NAME chưa được nạp — kiểm tra .env (xem .env.example).");
  process.exit(1);
}

const source = path.join(process.cwd(), "data", "growly.db");
const dbPath = path.join(process.cwd(), "data", `content-test-${Date.now()}.db`);
if (!fs.existsSync(source)) {
  console.error('No data/growly.db — run "npm run import:posts" first.');
  process.exit(1);
}
fs.copyFileSync(source, dbPath);
process.env.GROWLY_DB = dbPath;

const STUB = path.join(__dirname, "stub.js");
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === "server-only" || request === "next/cache") return STUB;
  return resolve.call(this, request, ...rest);
};

// Built from .env so the fixture matches whatever club is configured — this is
// also what proves the marker reaches the linter.
const FOOTER = [
  "-".repeat(62),
  process.env.CLUB_NAME,
  `📌Fanpage: ${process.env.CLUB_FANPAGE}`,
  `🏢Add: ${process.env.CLUB_ADDRESS}`,
  `📮Email: ${process.env.CLUB_EMAIL}`,
  `✅Website: ${process.env.CLUB_WEBSITE}`,
  process.env.CLUB_HASHTAGS,
];

/* A deliberately bad first draft, then a good one — exercises the repair pass. */
const BAD = `Thông báo mở lớp học
Bên cạnh đó, chúng tôi xin thông báo rằng các lớp học sẽ khai giảng.`;

const GOOD = [
  "📣 THÔNG BÁO MỞ LỚP PUBLIC HÈ 2026 📣",
  "-".repeat(62),
  "",
  "🔥 Các cậu đã sẵn sàng cho một mùa hè cày code chưa nhỉ❓",
  "",
  "🌈 Hè này chúng tớ mở 4 lớp public cho tất cả sinh viên HaUI, học trực tiếp tại phòng thực hành Khoa CNTT.",
  "",
  "☕ Lớp Java: 18h00 Thứ 2 hàng tuần",
  "🐍 Lớp Python: 18h00 Thứ 4 hàng tuần",
  "💻 Lớp Web: 18h00 Thứ 6 hàng tuần",
  "🎨 Lớp Photoshop: 18h00 Chủ nhật hàng tuần",
  "",
  "📋 Link đăng ký: https://forms.gle/example2026",
  "⏰ Hạn đóng link: 18h00 ngày 05/07/2026",
  "📍 Địa điểm: Phòng thực hành - Khoa CNTT",
  "",
  "💪 Còn chần chờ gì nữa, đăng ký thoiii! Chúc các HITers có một mùa hè thật rực rỡ nhaaa 🔥",
  ...FOOTER,
].join("\n");

const seen = [];
let turn = 0;

const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    seen.push({ url: req.url, auth: req.headers.authorization, body: JSON.parse(body) });
    turn += 1;
    // First call returns the bad draft, the repair call returns the good one.
    const content = turn === 1 ? BAD : `\`\`\`\n${GOOD}\n\`\`\``;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content } }] }));
  });
});

function cleanup() {
  server.close();
  for (const suffix of ["", "-wal", "-shm"]) {
    fs.rmSync(`${dbPath}${suffix}`, { force: true });
  }
}

server.listen(0, "127.0.0.1", async () => {
  const port = server.address().port;
  let failed = false;
  try {
    const db = new DatabaseSync(dbPath, { timeout: 5000 });
    const set = db.prepare(
      "INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    );
    // No trailing /chat/completions on purpose — the provider must append it.
    set.run("ai_base_url", `http://127.0.0.1:${port}/v1`);
    set.run("ai_model", "stub-model");
    set.run("ai_api_key", "sk-test-key");
    db.close();

    const { generatePost } = require(path.join(process.cwd(), ".smoke", "content", "generate.js"));
    const result = await generatePost({
      category: "lophoc",
      topic: "Mở đăng ký các lớp public hè 2026",
      facts: "Khai giảng 07/07/2026\nĐịa điểm: phòng thực hành Khoa CNTT",
      tone: "hype",
      selfPronoun: "chúng tớ",
      audience: "các cậu",
      address: process.env.CLUB_ADDRESS,
      extraTags: "",
      withFooter: true,
    });

    const check = (label, fn) => {
      try {
        fn();
        console.log(`  ✓ ${label}`);
      } catch (err) {
        failed = true;
        console.log(`  ✗ ${label}\n      ${err.message}`);
      }
    };

    console.log("Content pipeline");
    check("provider gets /v1/chat/completions appended", () =>
      assert.equal(seen[0].url, "/v1/chat/completions"),
    );
    check("bearer token is sent", () =>
      assert.equal(seen[0].auth, "Bearer sk-test-key"),
    );
    check("configured model is used", () =>
      assert.equal(seen[0].body.model, "stub-model"),
    );
    check("system prompt carries the category skeleton", () =>
      assert.match(seen[0].body.messages[0].content, /ba câu hỏi liên tiếp/),
    );
    check("user prompt carries real few-shot examples", () =>
      assert.match(seen[0].body.messages[1].content, /Bài thật 1/),
    );
    check("the brief's facts reach the model verbatim", () =>
      assert.match(seen[0].body.messages[1].content, /Khai giảng 07\/07\/2026/),
    );
    check("a failing draft triggers exactly one repair pass", () => {
      assert.equal(result.attempts, 2);
      assert.equal(seen.length, 2);
    });
    check("repair prompt lists the actual lint failures", () =>
      assert.match(seen[1].body.messages[3].content, /xưng hô cấm|Footer/),
    );
    check("code fences are stripped from the reply", () =>
      assert.ok(!result.content.includes("```")),
    );
    check("the repaired draft is the one returned", () =>
      assert.match(result.content, /THÔNG BÁO MỞ LỚP PUBLIC HÈ 2026/),
    );
    check("the repaired draft passes the linter", () => {
      assert.equal(result.lint.failed, 0, `still failing: ${result.remaining.join("; ")}`);
      assert.ok(result.lint.score >= 90, `score ${result.lint.score}`);
    });

    console.log(
      failed
        ? "\nSome checks failed."
        : `\nAll checks passed. Draft scored ${result.lint.score}/100 after ${result.attempts} call(s).`,
    );
  } catch (err) {
    failed = true;
    console.error(err);
  } finally {
    cleanup();
    process.exit(failed ? 1 : 0);
  }
});
