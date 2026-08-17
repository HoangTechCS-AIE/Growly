/**
 * Browser checks — the parts a server-side test cannot reach: quick add,
 * completing a task, dragging on the board and on the calendar, note autosave,
 * the mobile drawer, the theme toggle and colour contrast.
 *
 * It needs Chrome and puppeteer-core, and a server pointed at a throwaway
 * database so your real one is never touched:
 *
 *   npm i -D puppeteer-core
 *   GROWLY_DB=/tmp/growly-test.db npm run seed
 *   npm run build
 *   GROWLY_DB=/tmp/growly-test.db PORT=3100 npm start &
 *   node scripts/browser-test.mjs
 *
 * Override with BASE=… and CHROME=… if your setup differs.
 */
import puppeteer from "puppeteer-core";

const BASE = process.env.BASE ?? "http://localhost:3100";
const CHROME = process.env.CHROME ?? "/usr/bin/google-chrome";

let failures = 0;
const expect = (condition, message) => {
  if (!condition) failures += 1;
  console.log(`  ${condition ? "✓" : "✗"} ${message}`);
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu"],
  defaultViewport: { width: 1600, height: 1100 },
});

const problems = [];
function watch(page) {
  page.on("pageerror", (error) => problems.push(String(error)));
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) problems.push(message.text().slice(0, 200));
  });
  return page;
}

console.log("\nGrowly browser test\n\nInteractions");

const page = watch(await browser.newPage());

/* ------------------------------------------------------------- quick add -- */
await page.goto(`${BASE}/tasks?view=list`, { waitUntil: "networkidle2" });
const marker = `UITest-${Date.now()}`;
await page.type("#quick-add", `${marker} @Landing #uitest * tomorrow 09:00 30m`);
await page.keyboard.press("Enter");
await wait(2500);

await page.goto(`${BASE}/tasks?view=list`, { waitUntil: "networkidle2" });
const listText = await page.evaluate(() => document.body.innerText);
expect(listText.includes(marker), "quick add creates a task and it shows in the list");
expect(listText.includes("Landing page"), "the quick-added task picked up its project");

/* ------------------------------------------------------- complete a task -- */
const toggled = await page.evaluate((m) => {
  const row = [...document.querySelectorAll("[data-task-id]")].find((d) => d.innerText.includes(m));
  row?.querySelector('[data-role="toggle-done"]')?.click();
  return Boolean(row);
}, marker);
await wait(2000);

await page.goto(`${BASE}/tasks?view=list&done=1`, { waitUntil: "networkidle2" });
const statusAfter = await page.evaluate((m) => {
  const row = [...document.querySelectorAll("[data-task-id]")].find((d) => d.innerText.includes(m));
  return row?.getAttribute("data-status");
}, marker);
expect(toggled && statusAfter === "done", `the checkbox completes a task (status: ${statusAfter})`);

await page.evaluate((m) => {
  const row = [...document.querySelectorAll("[data-task-id]")].find((d) => d.innerText.includes(m));
  row?.querySelector('[data-role="toggle-done"]')?.click();
}, marker);
await wait(2000);

/* ------------------------------------------------------ board drag & drop -- */
await page.goto(`${BASE}/tasks?view=board`, { waitUntil: "networkidle2" });
const dragged = await page.evaluate((m) => {
  const card = [...document.querySelectorAll("[data-task-id]")].find((d) => d.innerText.includes(m));
  const doing = document.querySelector('[data-column="doing"]');
  if (!card || !doing) return false;
  const data = new DataTransfer();
  card.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer: data }));
  doing.dispatchEvent(new DragEvent("dragover", { bubbles: true, dataTransfer: data }));
  doing.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: data }));
  return true;
}, marker);
await wait(2500);

await page.goto(`${BASE}/tasks?view=board`, { waitUntil: "networkidle2" });
const inDoing = await page.evaluate(
  (m) => document.querySelector('[data-column="doing"]')?.innerText.includes(m) ?? false,
  marker,
);
expect(dragged && inDoing, "dragging a card into Doing changes its status");

/* --------------------------------------------------- calendar time block -- */
await page.goto(`${BASE}/calendar?view=week`, { waitUntil: "networkidle2" });
const droppedTitle = await page.evaluate(() => {
  const chip = document.querySelector("div[draggable='true']");
  const column = document.querySelectorAll("[data-day-column]")[2];
  if (!chip || !column) return null;
  const title = chip.innerText.split("\n")[0];
  const data = new DataTransfer();
  chip.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer: data }));
  const box = column.getBoundingClientRect();
  column.dispatchEvent(
    new DragEvent("drop", { bubbles: true, dataTransfer: data, clientY: box.top + 120 }),
  );
  return title;
});
await wait(2500);

await page.goto(`${BASE}/calendar?view=week`, { waitUntil: "networkidle2" });
const calendarText = await page.evaluate(() => document.body.innerText);
expect(
  Boolean(droppedTitle) && calendarText.includes(droppedTitle),
  `dropping "${droppedTitle}" on the grid schedules it`,
);

const draftUrl = await (async () => {
  await page.evaluate(() => {
    const column = document.querySelectorAll("[data-day-column]")[2];
    const box = column.getBoundingClientRect();
    column.dispatchEvent(
      new MouseEvent("click", { bubbles: true, clientX: box.left + 20, clientY: box.top + 80 }),
    );
  });
  await wait(1500);
  return page.url();
})();
expect(
  /\/tasks\/new\?date=\d{4}-\d{2}-\d{2}&start=\d{2}:\d{2}/.test(draftUrl),
  `clicking an empty slot opens a pre-filled draft (${draftUrl.split("?")[1] ?? draftUrl})`,
);
const draft = await page.evaluate(() => ({
  date: document.querySelector("#scheduled")?.value,
  start: document.querySelector("#start")?.value,
}));
expect(Boolean(draft.date && draft.start), `the draft carries the day and time (${draft.date} ${draft.start})`);

/* ------------------------------------------------------------------ notes -- */
await page.goto(`${BASE}/notes`, { waitUntil: "networkidle2" });
await page.evaluate(() => {
  [...document.querySelectorAll("a")].find((a) => a.href.includes("/notes/"))?.click();
});
await page.waitForSelector("textarea", { timeout: 10000 });
const stamp = `autosave-${Date.now()}`;
await page.type("textarea", `\n${stamp}`);
await wait(2500);

const noteUrl = page.url();
await page.goto(noteUrl, { waitUntil: "networkidle2" });
const noteBody = await page.evaluate(() => document.querySelector("textarea")?.value ?? "");
expect(noteBody.includes(stamp), "the note editor autosaves what you type");

const beforeConvert = await page.evaluate(() => document.body.innerText);
await page.evaluate(() => {
  const textarea = document.querySelector("textarea");
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length - 5, textarea.value.length - 5);
  [...document.querySelectorAll("button")]
    .find((b) => b.innerText.includes("Line → task"))
    ?.click();
});
await wait(2500);
const afterConvert = await page.evaluate(() => document.body.innerText);
expect(afterConvert !== beforeConvert, "Line → task turns the current line into a task");

/* ------------------------------------------------------- morning planning -- */
await page.goto(BASE, { waitUntil: "networkidle2" });
const starred = await page.evaluate(() => {
  const row = [...document.querySelectorAll("[data-task-id]")].find((d) =>
    d.querySelector('button[title*="Big 3"]'),
  );
  if (!row) return null;
  row.querySelector('button[title*="Big 3"]').click();
  return row.innerText.split("\n")[0];
});
await wait(2500);
await page.goto(BASE, { waitUntil: "networkidle2" });
const big3 = await page.evaluate(() => document.body.innerText.split("Schedule")[0]);
expect(Boolean(starred) && big3.includes(starred), `starring adds "${starred}" to today's Big 3`);

console.log("\nResponsive, theme and contrast");

/* ---------------------------------------------------------- mobile drawer -- */
const phone = watch(await browser.newPage());
await phone.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
await phone.goto(BASE, { waitUntil: "networkidle2" });

expect(
  await phone.evaluate(() => {
    const rail = document.querySelector("aside");
    return !rail || getComputedStyle(rail).display === "none";
  }),
  "the desktop rail is hidden on a phone viewport",
);

await phone.click('button[aria-label="Open navigation"]');
await wait(400);
const drawer = await phone.evaluate(() => {
  const panel = document.querySelector('[role="dialog"][aria-modal="true"]');
  return {
    open: Boolean(panel),
    links: panel?.querySelectorAll("a").length ?? 0,
    focusInside: Boolean(document.activeElement?.closest('[role="dialog"]')),
  };
});
expect(drawer.open && drawer.links >= 7, "the menu button opens a drawer with the full nav");
expect(drawer.focusInside, "focus moves into the drawer when it opens");

await phone.keyboard.press("Escape");
await wait(400);
expect(
  await phone.evaluate(() => !document.querySelector('[role="dialog"][aria-modal="true"]')),
  "Escape closes the drawer",
);
expect(
  await phone.evaluate(
    () => document.activeElement?.getAttribute("aria-label") === "Open navigation",
  ),
  "focus returns to the menu button after closing",
);

for (const [path, label] of [
  ["/", "today"],
  ["/tasks?view=board", "board"],
  ["/calendar?view=week", "calendar"],
  ["/notes", "notes"],
  ["/strategy", "strategy"],
]) {
  await phone.goto(`${BASE}${path}`, { waitUntil: "networkidle2" });
  const overflows = await phone.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  expect(!overflows, `${label} does not scroll sideways on a phone`);
}

/* ------------------------------------------------------------------ theme -- */
const desk = watch(await browser.newPage());
await desk.setViewport({ width: 1400, height: 900 });
await desk.goto(BASE, { waitUntil: "networkidle2" });

const clickTheme = () =>
  desk.evaluate(() => {
    // Two toggles exist (mobile bar and desktop rail); click whichever is visible.
    [...document.querySelectorAll('button[aria-label*="Activate to change the theme"]')]
      .find((button) => button.offsetParent !== null)
      ?.click();
  });

const cycle = [];
for (let i = 0; i < 3; i += 1) {
  await clickTheme();
  await wait(250);
  cycle.push(
    await desk.evaluate(() => [
      document.documentElement.getAttribute("data-theme"),
      localStorage.getItem("growly-theme"),
    ]),
  );
}
expect(
  cycle[0][0] === "light" && cycle[1][0] === "dark" && cycle[2][0] === null,
  `theme cycles system → light → dark (${cycle.map(([t]) => t ?? "system").join(" → ")})`,
);
expect(cycle[1][1] === "dark", "the chosen theme is persisted");

await desk.evaluate(() => localStorage.setItem("growly-theme", "light"));
await desk.reload({ waitUntil: "networkidle2" });
const painted = await desk.evaluate(() => ({
  theme: document.documentElement.getAttribute("data-theme"),
  background: getComputedStyle(document.body).backgroundColor,
}));
expect(
  painted.theme === "light" && painted.background === "rgb(246, 247, 249)",
  `a stored theme survives a reload (${painted.background})`,
);

/* --------------------------------------------------------------- contrast -- */
async function contrastReport() {
  return desk.evaluate(() => {
    // A canvas normalises whatever colour syntax the browser reports.
    const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    const luminance = (color) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      return [...ctx.getImageData(0, 0, 1, 1).data]
        .slice(0, 3)
        .map((v) => {
          const channel = v / 255;
          return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
        })
        .reduce((sum, v, i) => sum + [0.2126, 0.7152, 0.0722][i] * v, 0);
    };
    const ratio = (a, b) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
    };
    const token = (name) =>
      getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return {
      "ink on canvas": ratio(token("--ink"), token("--canvas")),
      "muted on canvas": ratio(token("--muted"), token("--canvas")),
      "muted on surface": ratio(token("--muted"), token("--surface")),
      "accent on surface": ratio(token("--accent"), token("--surface")),
      "accent-ink on accent": ratio(token("--accent-ink"), token("--accent")),
      "danger on surface": ratio(token("--danger"), token("--surface")),
      "warn on surface": ratio(token("--warn"), token("--surface")),
    };
  });
}

for (const theme of ["light", "dark"]) {
  await desk.evaluate((t) => localStorage.setItem("growly-theme", t), theme);
  await desk.reload({ waitUntil: "networkidle2" });
  for (const [pair, value] of Object.entries(await contrastReport())) {
    expect(value >= 4.5, `${theme}: ${pair} = ${value}:1`);
  }
}

console.log(`\nConsole problems: ${problems.length ? problems.slice(0, 3).join(" | ") : "none"}`);
console.log(failures ? `\n${failures} check(s) failed.\n` : "\nAll browser checks passed.\n");
await browser.close();
process.exit(failures ? 1 : 0);
