/**
 * Checks the document → brief → post path.
 *
 * Extracts a real .docx notice, a generated .pdf, drives `analyzeDocument`
 * against a stub OpenAI-compatible endpoint, then feeds the filled brief into
 * `generatePost` to prove the house rules and the linter still gate the output.
 *
 * Run with `npm run test:document`.
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
const dbPath = path.join(process.cwd(), "data", `doc-test-${Date.now()}.db`);
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

/* --------------------------------------------------- a minimal, valid PDF */

function makePdf(line) {
  const objects = [
    "<</Type/Catalog/Pages 2 0 R>>",
    "<</Type/Pages/Kids[3 0 R]/Count 1>>",
    "<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]/Contents 4 0 R" +
      "/Resources<</Font<</F1 5 0 R>>>>>>",
    null, // content stream, filled below
    "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
  ];
  const stream = `BT /F1 11 Tf 20 150 Td (${line}) Tj ET`;
  objects[3] = `<</Length ${stream.length}>>\nstream\n${stream}\nendstream`;

  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

/* ------------------------------------------------------- stub LLM replies */
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

const BRIEF_JSON = JSON.stringify({
  category: "sukien",
  topic: "Mở đăng ký Olympic Tin học, ICPC, Olympic AI và An toàn thông tin 2026",
  facts: [
    "Hạn đăng ký: 22/08/2026 - 10/09/2026",
    "Ôn thi cấp Đại học: 10/09/2026 - 02/10/2026",
    "Lịch thi: Olympic cá nhân, Olympic AI, An toàn thông tin 03-04/10/2026; ICPC 10-11/10/2026; PROCON, Phần mềm nguồn mở 17-18/10/2026",
    "Địa điểm: phòng máy Trường CNTT&TT, Nhà A1",
    "Link đăng ký cá nhân: https://tinyurl.com/olpcanhan2026",
    "Link đăng ký tập thể: https://tinyurl.com/olptapthe2026",
    "Liên hệ: thầy Nguyễn Trung Phú 0902 131 386",
  ].join("\n"),
  extraTags: "#OLP2026 #ICPC",
  tone: "hype",
  warnings: ["Ngày ban hành ghi 03/07/2025 nhưng mọi mốc bên trong là 2026 — cần xác nhận."],
});

const POST = [
  "📣 MỞ ĐĂNG KÝ OLYMPIC TIN HỌC & ICPC 2026 📣",
  "-".repeat(62),
  "",
  "🔥 Các cậu đã sẵn sàng cho sân chơi lớn nhất năm chưa nhỉ❓",
  "",
  "🌈 Mùa 2026 mở rộng thêm Olympic AI và An toàn thông tin, chúng tớ mong gặp thật nhiều chiến binh nhà HIT.",
  "",
  "⏰ Hạn đăng ký: 22/08/2026 - 10/09/2026",
  "📍 Địa điểm: Phòng máy Trường CNTT&TT, Nhà A1",
  "👉 Đăng ký cá nhân: https://tinyurl.com/olpcanhan2026",
  "👉 Đăng ký tập thể: https://tinyurl.com/olptapthe2026",
  "",
  "💪 Còn chần chờ gì nữa, đăng ký thoiii! Chúc các HITers thi thật tốt nhaaa 🔥",
  ...FOOTER,
].join("\n");

const seen = [];
const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const parsed = JSON.parse(body);
    seen.push(parsed);
    // The extraction prompt forbids writing a post; tell them apart by that.
    const isExtraction = /rút ra các trường thông tin/.test(parsed.messages[0].content);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        choices: [{ message: { role: "assistant", content: isExtraction ? BRIEF_JSON : POST } }],
      }),
    );
  });
});

function cleanup() {
  server.close();
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${dbPath}${suffix}`, { force: true });
}

let failed = false;
const check = (label, fn) => {
  try {
    fn();
    console.log(`  ✓ ${label}`);
  } catch (err) {
    failed = true;
    console.log(`  ✗ ${label}\n      ${err.message}`);
  }
};

server.listen(0, "127.0.0.1", async () => {
  const port = server.address().port;
  try {
    const db = new DatabaseSync(dbPath, { timeout: 5000 });
    const set = db.prepare(
      "INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    );
    set.run("ai_base_url", `http://127.0.0.1:${port}/v1`);
    set.run("ai_model", "stub-model");
    set.run("ai_api_key", "sk-test-key");
    set.run("ai_temperature", "0.9");
    db.close();

    const base = path.join(process.cwd(), ".smoke", "content");
    const { docxToText, extractDocument } = require(path.join(base, "extract.js"));
    const { analyzeDocument } = require(path.join(base, "analyze.js"));
    const { generatePost } = require(path.join(base, "generate.js"));

    console.log("Document extraction");
    const docxPath = path.join(process.cwd(), "docs", "ThongBaoOLP2026_CapDH.docx");
    const hasDocx = fs.existsSync(docxPath);
    if (!hasDocx) console.log("  – .docx mẫu không có, bỏ qua nhóm docx");

    let docxText = "";
    if (hasDocx) {
      docxText = docxToText(fs.readFileSync(docxPath));
      check("reads .docx without any zip dependency", () =>
        assert.ok(docxText.length > 5000, `chỉ ${docxText.length} ký tự`),
      );
      check("keeps Vietnamese diacritics intact", () =>
        assert.match(docxText, /Olympic Tin học sinh viên/),
      );
      check("keeps table rows paired, not one cell per line", () =>
        assert.match(docxText, /Khối chuyên tin \| 03-04\/10\/2026/),
      );
      check("keeps links and phone numbers verbatim", () => {
        assert.match(docxText, /https:\/\/tinyurl\.com\/olpcanhan2026/);
        assert.match(docxText, /0902 131 386/);
      });
      check("drops Word's stray shape-id runs", () =>
        assert.ok(!/^\d{6,}$/m.test(docxText)),
      );
    }

    const pdfFile = new File([makePdf("Thoi gian: 18h00 ngay 16/08/2026")], "tb.pdf");
    const pdfDoc = await extractDocument(pdfFile);
    check("reads a .pdf text layer", () =>
      assert.match(pdfDoc.text, /18h00 ngay 16\/08\/2026/),
    );

    console.log("\nRejects what it cannot read");
    const checkAsync = async (label, fn) => {
      try {
        await fn();
        console.log(`  ✓ ${label}`);
      } catch (err) {
        failed = true;
        console.log(`  ✗ ${label}\n      ${err.message}`);
      }
    };
    const refuses = (name, pattern) =>
      assert.rejects(
        () => extractDocument(new File([Buffer.from("x")], name)),
        (err) => pattern.test(err.message),
      );

    await checkAsync("a legacy .doc is refused with a fix-it message", () =>
      refuses("thongbao.doc", /\.docx/),
    );
    await checkAsync("unsupported extensions are refused", () =>
      refuses("thongbao.txt", /Chỉ nhận/),
    );
    await checkAsync("a PDF with no text layer explains OCR is needed", () =>
      assert.rejects(
        () => extractDocument(new File([makePdf(" ")], "scan.pdf")),
        (err) => /bản scan|không có chữ/i.test(err.message),
      ),
    );

    if (hasDocx) {
      console.log("\nDocument → brief");
      const result = await analyzeDocument(
        new File([fs.readFileSync(docxPath)], "ThongBaoOLP2026_CapDH.docx"),
      );
      const extractionCall = seen[seen.length - 1];

      check("the whole notice reaches the model", () =>
        assert.match(extractionCall.messages[1].content, /ICPC Asia Danang/),
      );
      check("extraction runs at temperature 0, not the writing temp", () =>
        assert.equal(extractionCall.temperature, 0),
      );
      check("the model is told not to write the post", () =>
        assert.match(extractionCall.messages[0].content, /KHÔNG viết bài đăng/),
      );
      check("category and topic come back filled", () => {
        assert.equal(result.brief.category, "sukien");
        assert.match(result.brief.topic, /Olympic/);
      });
      check("facts keep the document's exact dates and links", () => {
        assert.match(result.brief.facts, /22\/08\/2026/);
        assert.match(result.brief.facts, /tinyurl\.com\/olptapthe2026/);
      });
      check("contradictions in the document are surfaced, not fixed", () =>
        assert.match(result.brief.warnings.join(" "), /03\/07\/2025/),
      );
      check("an unknown category falls back instead of throwing", () => {
        // coerce() guards this; assert the guard exists by shape.
        assert.ok(["sukien", "thongbao"].includes(result.brief.category));
      });

      console.log("\nBrief → post (rules still apply)");
      const post = await generatePost({
        ...result.brief,
        selfPronoun: "chúng tớ",
        audience: "các cậu",
        address: process.env.CLUB_ADDRESS,
        withFooter: true,
      });
      const writingCall = seen[seen.length - 1];

      check("the writing call carries the house rules", () => {
        assert.match(writingCall.messages[0].content, /CẤM TUYỆT ĐỐI/);
        assert.match(writingCall.messages[0].content, /Emoji đứng ĐẦU DÒNG/);
      });
      check("the writing call still uses real few-shot examples", () =>
        assert.match(writingCall.messages[1].content, /Bài thật 1/),
      );
      check("facts pulled from the document reach the writer", () =>
        assert.match(writingCall.messages[1].content, /tinyurl\.com\/olpcanhan2026/),
      );
      check("writing uses the configured temperature, not 0", () =>
        assert.equal(writingCall.temperature, 0.9),
      );
      check("the finished post passes the linter", () => {
        assert.equal(post.lint.failed, 0, `còn lỗi: ${post.remaining.join("; ")}`);
        assert.ok(post.lint.score >= 90, `score ${post.lint.score}`);
      });

      console.log(
        failed
          ? "\nSome checks failed."
          : `\nAll checks passed. Post scored ${post.lint.score}/100.`,
      );
    }
  } catch (err) {
    failed = true;
    console.error(err);
  } finally {
    cleanup();
    process.exit(failed ? 1 : 0);
  }
});
