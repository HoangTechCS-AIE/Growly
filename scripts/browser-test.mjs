/**
 * Browser checks — the parts a server-side test cannot reach: task creation,
 * completing a task, dragging on the board and on the calendar, the block note
 * editor (shortcuts, slash menu, IME input, sub-pages, undo, block selection),
 * the mobile More sheet, the
 * theme toggle and colour contrast.
 *
 * It signs itself in first — on a throwaway database that means creating the
 * account the setup screen asks for.
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

/* ---------------------------------------------------------------- sign in -- */
// Every route sits behind the login. A throwaway database has no account yet,
// so the first visit sets one; a re-used database just signs in.
const ACCOUNT = { username: "uitest", password: "growly-uitest" };
await page.goto(BASE, { waitUntil: "networkidle2" });
if (!new URL(page.url()).pathname.startsWith("/tasks")) {
  const onSetup = page.url().includes("/setup");
  await page.type("#username", ACCOUNT.username);
  await page.type("#password", ACCOUNT.password);
  if (onSetup) await page.type("#confirm", ACCOUNT.password);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2" }),
    page.click('button[type="submit"]'),
  ]);
}
expect(new URL(page.url()).pathname === "/", "signing in opens the app");

/* ---------------------------------------------------------- create a task -- */
// Quick add is gone; the New task form is the way in now.
await page.goto(`${BASE}/tasks/new`, { waitUntil: "networkidle2" });
const marker = `UITest-${Date.now()}`;
await page.type("#title", marker);
await page.select("#project", await page.evaluate(() => {
  const option = [...document.querySelectorAll("#project option")]
    .find((o) => o.textContent.includes("Landing page"));
  return option ? option.value : "";
}));
await page.click('button[type="submit"]');
await wait(2500);

await page.goto(`${BASE}/tasks?view=list`, { waitUntil: "networkidle2" });
const listText = await page.evaluate(() => document.body.innerText);
expect(listText.includes(marker), "the New task form creates a task and it shows in the list");
expect(listText.includes("Landing page"), "the new task kept the project it was given");

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
await page.waitForSelector(".nt-header .nt-action", { timeout: 10000 });
await page.click(".nt-header .nt-action");
await page.waitForSelector(".nb-editor", { timeout: 10000 });
await wait(600);
const noteUrl = page.url();

const blockTypes = () =>
  page.$$eval(".nb-row", (rows) => rows.map((row) => row.getAttribute("data-type")));

await page.click(".nb-tail");
await wait(150);
await page.keyboard.type("# Launch plan");
await wait(200);
expect((await blockTypes())[0] === "h1", "`# ` + space turns a block into Heading 1");

await page.keyboard.press("Enter");
await page.keyboard.type("- first bullet");
await wait(200);
await page.keyboard.press("Enter");
await page.keyboard.press("Tab");
await page.keyboard.type("nested bullet");
await wait(250);
const indented = await page.$$eval(".nb-row", (rows) =>
  rows.some((row) => row.style.marginLeft && row.style.marginLeft !== "0px"),
);
expect(indented, "Tab indents a list item");

await page.keyboard.press("Enter");
await wait(120);
await page.keyboard.press("Enter");
await wait(120);
await page.keyboard.press("Enter");
await wait(200);
const stamp = `autosave-${Date.now()}`;
await page.keyboard.type(`[] ${stamp}`);
await wait(250);
expect((await blockTypes())[3] === "todo", "`[] ` + space makes a to-do");

await page.click(".nb-check");
await wait(250);
expect((await page.$$(".nb-check-on")).length === 1, "clicking the checkbox ticks the to-do");

await page.click(".nb-tail");
await wait(150);
await page.keyboard.type("/call");
await wait(300);
expect(Boolean(await page.$(".nb-slash")), "typing `/` opens the block menu");
await page.keyboard.press("Enter");
await wait(300);
await page.keyboard.type("remember this");
await wait(200);
expect((await blockTypes())[4] === "callout", "the slash menu turns the block into a callout");

// A real IME (Telex, VNI) composes before it commits; the editor must leave the
// DOM alone until compositionend or the candidate text is destroyed.
await page.keyboard.press("Enter");
await wait(150);
const composing = await page.evaluate(async () => {
  const el = document.activeElement;
  const caretToEnd = () => {
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  };
  el.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
  el.textContent = "Tiến độ";
  caretToEnd();
  el.dispatchEvent(new InputEvent("input", { bubbles: true, data: "ộ", isComposing: true }));
  // React state settles asynchronously; read once it has.
  await new Promise((resolve) => setTimeout(resolve, 400));
  return {
    text: el.textContent,
    placeholderPainted: getComputedStyle(el, "::before").content !== "none",
  };
});
expect(composing.text === "Tiến độ", `the composing text survives untouched (${composing.text})`);
// The placeholder is drawn with ::before over the same box. While the IME was
// composing, React used to still think the block was empty and painted it on
// top of the candidate text.
expect(
  !composing.placeholderPainted,
  "the placeholder stops painting as soon as composing text appears",
);

await page.evaluate(() => {
  const el = document.activeElement;
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const selection = getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  el.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "Tiến độ" }));
});
await wait(300);
await page.keyboard.type(" tốt");
await wait(2200);
const composed = await page.evaluate(() => document.activeElement.textContent);
expect(composed === "Tiến độ tốt", `IME-composed Vietnamese commits intact (got: ${composed})`);

await page.goto(noteUrl, { waitUntil: "networkidle2" });
await wait(400);
const reloaded = await blockTypes();
expect(
  JSON.stringify(reloaded.slice(0, 5)) === JSON.stringify(["h1", "bullet", "bullet", "todo", "callout"]),
  `the block editor autosaves and reloads what you wrote (${reloaded.slice(0, 5).join(", ")})`,
);
expect((await page.$$(".nb-check-on")).length === 1, "the ticked to-do survives a reload");

const beforeConvert = await page.evaluate(() => document.body.innerText);
await page.hover(".nb-row:nth-child(4)");
await wait(200);
await page.click(".nb-row:nth-child(4) .nb-handle");
await wait(300);
const menuItems = await page.$$eval(".nb-menu .nb-menu-item", (n) => n.map((x) => x.textContent));
await (await page.$$(".nb-menu .nb-menu-item"))[menuItems.indexOf("Send to tasks")].click();
await wait(2500);
const afterConvert = await page.evaluate(() => document.body.innerText);
expect(afterConvert !== beforeConvert, "the block menu sends a line to Tasks");

/* ------------------------------------------------------------- sub-pages -- */
await page.goto(noteUrl, { waitUntil: "networkidle2" });
await page.waitForSelector(".nt-active", { timeout: 10000 });
const treeBefore = await page.$$eval(".nt-row", (rows) => rows.length);
await page.hover(".nt-active");
await wait(200);
await (await page.$$(".nt-active .nt-action"))[1].click();
await wait(1800);
const treeAfter = await page.$$eval(".nt-row", (rows) => rows.length);
expect(treeAfter === treeBefore + 1, `a sub-page appears in the tree (${treeBefore} → ${treeAfter})`);

const crumbs = await page.$$eval(".np-breadcrumb a", (nodes) => nodes.map((n) => n.textContent));
expect(crumbs.length >= 2, `the sub-page shows its parent in the breadcrumb (${crumbs.join(" / ")})`);

await page.click(".np-add-row .np-add-btn");
await wait(300);
await (await page.$$(".np-emoji-picker button"))[3].click();
await wait(1200);
expect(Boolean(await page.$(".np-icon")), "a page can be given an emoji icon");

/* ------------------------------------------------------ undo and blocks -- */
await page.goto(`${BASE}/notes`, { waitUntil: "networkidle2" });
await page.waitForSelector(".nt-header .nt-action", { timeout: 10000 });
await page.click(".nt-header .nt-action");
await page.waitForSelector(".nb-editor", { timeout: 10000 });
await wait(600);

const blockText = () =>
  page.$$eval(".nb-row .nb-content", (rows) => rows.map((r) => r.textContent));
const undo = async () => {
  await page.keyboard.down("Control");
  await page.keyboard.press("KeyZ");
  await page.keyboard.up("Control");
  await wait(350);
};

await page.click(".nb-tail");
await wait(150);
await page.keyboard.type("alpha");
await page.keyboard.press("Enter");
await page.keyboard.type("beta");
await page.keyboard.press("Enter");
await page.keyboard.type("gamma");
await wait(300);

await undo();
expect(
  (await blockText()).join(",") === "alpha,beta,",
  "one undo takes back a whole typing run, not one letter",
);
await undo();
expect((await blockText()).join(",") === "alpha,beta", "undo takes back a block split");

await page.keyboard.down("Control");
await page.keyboard.down("Shift");
await page.keyboard.press("KeyZ");
await page.keyboard.up("Shift");
await page.keyboard.up("Control");
await wait(350);
expect((await blockText()).join(",") === "alpha,beta,", "redo puts the split back");

await page.hover(".nb-row:nth-child(2)");
await wait(200);
await page.click(".nb-row:nth-child(2) .nb-handle");
await wait(250);
const blockMenu = await page.$$eval(".nb-menu .nb-menu-item", (n) => n.map((x) => x.textContent));
await (await page.$$(".nb-menu .nb-menu-item"))[blockMenu.indexOf("Delete")].click();
await wait(400);
expect(!(await blockText()).includes("beta"), "the block menu deletes a block");
await undo();
expect((await blockText()).includes("beta"), "undo brings a deleted block back");

// Dragging from one block into another selects whole blocks.
const contentRows = await page.$$(".nb-row .nb-content");
const firstRow = await contentRows[0].boundingBox();
const lastRow = await contentRows[contentRows.length - 1].boundingBox();
await page.mouse.move(firstRow.x + 4, firstRow.y + firstRow.height / 2);
await page.mouse.down();
await page.mouse.move(lastRow.x + lastRow.width / 2, lastRow.y + lastRow.height / 2, { steps: 12 });
await page.mouse.up();
await wait(400);
expect((await page.$$(".nb-selected")).length >= 2, "dragging across blocks selects them");

// Headless Chrome refuses real clipboard writes, so watch the call instead.
await page.evaluate(() => {
  window.__copied = null;
  navigator.clipboard.writeText = (text) => {
    window.__copied = text;
    return Promise.resolve();
  };
});
await page.keyboard.down("Control");
await page.keyboard.press("KeyC");
await page.keyboard.up("Control");
await wait(350);
const copiedBlocks = (await page.evaluate(() => window.__copied)) ?? "";
expect(copiedBlocks.includes("alpha"), "Ctrl+C copies the selected blocks as Markdown");

await page.keyboard.press("Backspace");
await wait(400);
expect((await blockText()).length <= 1, "Backspace deletes the whole block selection");
await undo();
expect((await blockText()).includes("alpha"), "undo brings the whole selection back");

/* ------------------------------------------------------- embedded data -- */
await page.goto(`${BASE}/notes`, { waitUntil: "networkidle2" });
await page.waitForSelector(".nt-header .nt-action", { timeout: 10000 });
await page.click(".nt-header .nt-action");
await page.waitForSelector(".nb-editor", { timeout: 10000 });
await wait(600);
const embedNoteUrl = page.url();

// Give the page a project so an unfiltered embed has something to inherit.
await page.click(".np-add-row .np-add-btn:nth-child(3)");
await wait(300);
const projectPicker = (await page.$$(".np-prop select"))[1];
const projectValues = await page.$$eval(".np-prop:nth-child(2) option", (o) =>
  o.map((x) => x.value).filter(Boolean),
);
await projectPicker.select(projectValues[0]);
await wait(1500);

await page.click(".nb-tail");
await wait(200);
await page.keyboard.type("/task");
await wait(400);
const embedChoices = await page.$$eval(".nb-slash .nb-menu-item span:first-child", (n) =>
  n.map((x) => x.textContent),
);
const taskListAt = embedChoices.indexOf("Task list");
expect(taskListAt >= 0, "the slash menu offers a live task list");
for (let i = 0; i < taskListAt; i += 1) await page.keyboard.press("ArrowDown");
await page.keyboard.press("Enter");
await wait(1200);

const embedded = await page.$$eval(".nb-embed-title", (n) => n.map((x) => x.textContent));
expect(embedded.length > 0, "the embed lists the page's project tasks");
expect(Boolean(await page.$(".nb-embed-hint")), "an unfiltered embed follows the page");

await page.click(".nb-embed-list li .nb-check");
await wait(1600);
await page.goto(embedNoteUrl, { waitUntil: "networkidle2" });
await wait(1200);
expect(
  (await page.$$(".nb-embed-list .nb-check-on")).length >= 1,
  "ticking an embedded task is written to the database",
);
expect(
  (await page.$eval('.nb-row:has(.nb-embed)', (el) => el.dataset.type)) === "tasks",
  "the embed round-trips through Markdown as ::tasks",
);

/* ----------------------------------------------------------- databases -- */
await page.goto(`${BASE}/notes`, { waitUntil: "networkidle2" });
await page.waitForSelector(".nt-header .nt-action", { timeout: 10000 });
await page.click(".nt-header .nt-action");
await page.waitForSelector(".nb-editor", { timeout: 10000 });
await wait(600);
const dbNoteUrl = page.url();

const dbRows = () => page.$$eval(".db-table tbody tr", (r) => r.length);
const dbNames = () =>
  page.$$eval(".db-table tbody tr td:first-child input", (n) => n.map((x) => x.value));

await page.click(".nb-tail");
await wait(200);
await page.keyboard.type("/data");
await wait(400);
await page.keyboard.press("Enter");
await page.waitForSelector(".db-table", { timeout: 10000 });
await wait(600);

const dbHeaders = await page.$$eval(".db-head-button span", (n) => n.map((x) => x.textContent));
expect(
  dbHeaders.includes("Name") && dbHeaders.includes("Status") && dbHeaders.includes("Date"),
  `a new database starts with typed columns (${dbHeaders.join(", ")})`,
);

const dbCells = await page.$$(".db-table tbody tr td:first-child input");
const dbTitles = ["Landing copy", "Pricing page", "Onboarding email"];
for (let i = 0; i < dbTitles.length; i += 1) {
  await dbCells[i].click();
  await page.keyboard.type(dbTitles[i]);
}
await wait(900);

await page.click(".db-table tbody tr:nth-child(1) .db-cell-button");
await wait(350);
expect(Boolean(await page.$(".db-popover")), "a select cell opens an option picker");
await page.click(".db-popover .db-option-row:nth-child(2)");
await wait(700);

await page.click(".db-table tbody tr:nth-child(2) .db-cell-button");
await wait(300);
await page.keyboard.type("Blocked");
await wait(300);
await page.keyboard.press("Enter");
await wait(800);
expect(
  (await page.$eval(".db-table tbody tr:nth-child(2) .db-chip", (el) => el.textContent)) === "Blocked",
  "a select option can be created while typing",
);

await page.goto(dbNoteUrl, { waitUntil: "networkidle2" });
await page.waitForSelector(".db-table", { timeout: 10000 });
await wait(700);
expect(
  JSON.stringify(await dbNames()) === JSON.stringify(dbTitles),
  "database rows survive a reload",
);
expect(
  (await page.$eval(".nb-row:has(.db-block)", (el) => el.dataset.type)) === "db",
  "the database block round-trips through Markdown as ::db",
);

await page.click(".db-table th:first-child .db-head-button");
await wait(300);
await page.evaluate(() => {
  [...document.querySelectorAll(".db-popover .db-popover-item")]
    .find((b) => b.textContent.includes("Sort ascending"))
    .click();
});
await wait(800);
expect(
  JSON.stringify(await dbNames()) === JSON.stringify([...dbTitles].sort((a, b) => a.localeCompare(b))),
  "a column sort reorders the rows",
);

await page.click(".db-tool-actions .db-tool");
await wait(300);
await page.click(".db-panel .db-panel-add");
await wait(400);
const statusOption = (
  await page.$$eval(".db-panel .db-rule:first-child select option", (o) =>
    o.map((x) => ({ value: x.value, label: x.textContent })),
  )
).find((o) => o.label === "Status");
await (await page.$$(".db-panel .db-rule select"))[0].select(statusOption.value);
await wait(500);
await page.evaluate(() => {
  const operator = document.querySelectorAll(".db-panel .db-rule select")[1];
  operator.value = "not_empty";
  operator.dispatchEvent(new Event("change", { bubbles: true }));
});
await wait(800);
expect((await dbRows()) === 2, `a saved filter narrows the table (${await dbRows()} rows)`);

await page.evaluate(() =>
  [...document.querySelectorAll(".db-view-tab")].find((b) => b.textContent === "Board").click(),
);
await wait(900);
expect(
  (await page.$$eval(".db-column-head .db-chip", (n) => n.length)) >= 4,
  "the board view makes a column per select option",
);
expect((await page.$$(".db-card")).length >= 1, "cards appear on the board");

await page.evaluate(() =>
  [...document.querySelectorAll(".db-view-tab")].find((b) => b.textContent === "Calendar").click(),
);
await wait(900);
expect((await page.$$(".db-cal-day")).length >= 28, "the calendar view draws a month grid");

await page.goto(dbNoteUrl, { waitUntil: "networkidle2" });
await page.waitForSelector(".db-block", { timeout: 10000 });
await wait(800);
expect(Boolean(await page.$(".db-calendar")), "the chosen view and filters are remembered");

/* ------------------------------------------------------------ popovers -- */
/* Menus used to be positioned inside the element they belonged to, so a
   scrolling ancestor clipped them and grew a scrollbar. They are portalled
   now; this guards the regression. */
const clipReport = (selector) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return { found: false, clippers: [], items: [] };
    const box = el.getBoundingClientRect();
    const clippers = [];
    for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (!/auto|scroll|hidden/.test(style.overflowX + style.overflowY)) continue;
      const rect = node.getBoundingClientRect();
      if (
        box.top < rect.top - 1 || box.bottom > rect.bottom + 1 ||
        box.left < rect.left - 1 || box.right > rect.right + 1
      ) {
        clippers.push(node.className || node.tagName);
      }
    }
    return {
      found: true,
      inBody: el.parentElement === document.body,
      clippers,
      bottomInViewport: box.bottom <= window.innerHeight + 1,
      items: el.innerText.split("\n").filter(Boolean),
    };
  }, selector);

// A click with no mousedown never dismisses anything; do it the way a person would.
const dismissPopover = async () => {
  await page.mouse.click(1300, 800);
  await wait(250);
};

await page.goto(`${BASE}/notes`, { waitUntil: "networkidle2" });
await page.waitForSelector(".nt-row", { timeout: 10000 });
await page.hover(".nt-row");
await wait(250);
await page.click(".nt-row .nt-action");
await wait(400);

const treeMenu = await clipReport("[data-tree-popover]");
expect(treeMenu.found && treeMenu.inBody, "the page-tree ⋯ menu escapes the scrolling tree");
expect(
  treeMenu.clippers.length === 0,
  `nothing clips the tree menu (${treeMenu.clippers.join(", ") || "clear"})`,
);
expect(
  treeMenu.items.includes("Duplicate") && treeMenu.items.includes("Delete"),
  `every tree menu item is visible (${treeMenu.items.join(" / ")})`,
);
const treeScroll = await page.$eval(".nt-tree", (el) => el.scrollHeight - el.clientHeight);
expect(treeScroll <= 1, `the tree gains no scrollbar from the menu (${treeScroll}px)`);

// Near the bottom edge a menu must flip up rather than run off-screen.
await dismissPopover();
await page.setViewport({ width: 1400, height: 420 });
await wait(400);
const treeRows = await page.$$(".nt-row");
const lastTreeRow = treeRows[treeRows.length - 1];
await lastTreeRow.hover();
await wait(250);
await (await lastTreeRow.$(".nt-action")).click();
await wait(450);
const flipped = await clipReport("[data-tree-popover]");
expect(flipped.found && flipped.bottomInViewport, "a menu near the bottom flips up to stay on screen");
await dismissPopover();
await page.setViewport({ width: 1600, height: 1100 });
await wait(300);

/* ------------------------------------------------------- my projects -- */
await page.goto(BASE, { waitUntil: "networkidle2" });
const navLabels = await page.$$eval("nav[aria-label='Main'] a", (a) =>
  a.map((x) => x.textContent.trim()),
);
expect(
  navLabels.some((l) => l.startsWith("My projects")) && !navLabels.some((l) => l.startsWith("Strategy")),
  `the sidebar leads with My projects (${navLabels.join(", ")})`,
);

await page.goto(`${BASE}/projects`, { waitUntil: "networkidle2" });
await page.waitForSelector(".pj-card", { timeout: 10000 });
await page.click(".pj-card");
await page.waitForSelector(".pj-title", { timeout: 10000 });
await wait(500);
const projectUrl = page.url();
const projectSections = await page.$$eval(".pj-section .section-title", (n) =>
  n.map((x) => x.textContent),
);
expect(
  projectSections.includes("Tasks") && projectSections.includes("Notes"),
  `a project holds its own tasks and notes (${projectSections.join(", ")})`,
);

const smallTask = `Small step ${Date.now()}`;
await (await page.$$(".pj-add input"))[0].click();
await page.keyboard.type(smallTask);
await page.keyboard.press("Enter");
await wait(1600);
expect(
  (await page.evaluate(() => document.body.innerText)).includes(smallTask),
  "a small task can be added from inside the project",
);

// `.pj-list li` spans both sections, so find the row by its text.
await page.evaluate((title) => {
  const row = [...document.querySelectorAll(".pj-list li")].find((li) =>
    li.textContent.includes(title),
  );
  row.querySelector(".nb-check").click();
}, smallTask);
await wait(1500);
await page.goto(projectUrl, { waitUntil: "networkidle2" });
await wait(600);
expect(
  (await page.$$(".pj-list .nb-check-on")).length >= 1,
  "ticking a task inside a project is written to the database",
);

await (await page.$$(".pj-add input"))[1].click();
await page.keyboard.type("Project note");
await page.keyboard.press("Enter");
await page.waitForSelector(".nb-editor", { timeout: 10000 });
await wait(700);
expect(page.url().includes("/notes/"), "adding a note from a project opens the editor");
await page.goto(projectUrl, { waitUntil: "networkidle2" });
await wait(600);
expect(
  (await page.evaluate(() => document.body.innerText)).includes("Project note"),
  "the new note is listed under its project",
);

/* --------------------------------------------------- the slimmed task form */
await page.goto(`${BASE}/tasks/new`, { waitUntil: "networkidle2" });
await wait(400);
const formLabels = () => page.$$eval("label", (n) => n.map((x) => x.textContent.trim()));
const shown = await formLabels();
expect(
  !shown.includes("Short-term outcome") && !shown.includes("Long-term contribution"),
  "the short-term and long-term fields are gone from the task form",
);
expect(!shown.includes("Goal"), "the Goal picker is gone from the task form");
expect(
  !shown.includes("Repeat") && !shown.includes("Waiting on"),
  "rarely-used fields start folded away",
);
await page.evaluate(() =>
  [...document.querySelectorAll("button")]
    .find((b) => b.textContent.trim() === "More options")
    .click(),
);
await wait(400);
const revealed = await formLabels();
expect(
  revealed.includes("Repeat") && revealed.includes("Waiting on") && revealed.includes("Area"),
  "More options reveals the rest",
);

await page.click("#title");
await page.keyboard.type("Made with the slim form");
await page.evaluate(() =>
  [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Create task").click(),
);
await page.waitForSelector("h1", { timeout: 10000 });
await wait(900);
expect(
  (await page.evaluate(() => document.body.innerText)).includes("Made with the slim form"),
  "the slim form still creates a task",
);

/* ------------------------------------------------ goals are out of the way */
await page.goto(BASE, { waitUntil: "networkidle2" });
await wait(500);
const todayText = (await page.evaluate(() => document.body.innerText)).toLowerCase();
expect(todayText.includes("active projects"), "Today reports on projects");
expect(!todayText.includes("alignment"), "the goal-alignment tile is gone from Today");

await page.goto(`${BASE}/review?kind=weekly`, { waitUntil: "networkidle2" });
await wait(500);
expect(
  (await page.evaluate(() => document.body.innerText)).toLowerCase().includes("project progress"),
  "the weekly review reports project progress",
);

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

/* ------------------------------------------------------- mobile More sheet -- */
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
expect(
  await phone.evaluate(() => {
    const bar = document.querySelector("nav.bottom-nav");
    return Boolean(bar) && getComputedStyle(bar).display !== "none" && bar.querySelectorAll("a").length === 4;
  }),
  "a bottom tab bar with four tabs shows on a phone viewport",
);

await phone.click('nav.bottom-nav button[aria-haspopup="dialog"]');
await wait(400);
const sheet = await phone.evaluate(() => {
  const panel = document.querySelector('[role="dialog"][aria-modal="true"]');
  return {
    open: Boolean(panel),
    links: panel?.querySelectorAll("a").length ?? 0,
    focusInside: Boolean(document.activeElement?.closest('[role="dialog"]')),
  };
});
expect(sheet.open && sheet.links >= 5, "the More button opens a sheet with the rest of the nav");
expect(sheet.focusInside, "focus moves into the sheet when it opens");

await phone.keyboard.press("Escape");
await wait(400);
expect(
  await phone.evaluate(() => !document.querySelector('[role="dialog"][aria-modal="true"]')),
  "Escape closes the sheet",
);
expect(
  await phone.evaluate(
    () => document.activeElement?.getAttribute("aria-haspopup") === "dialog",
  ),
  "focus returns to the More button after closing",
);

for (const [path, label] of [
  ["/", "today"],
  ["/tasks?view=board", "board"],
  ["/calendar?view=week", "calendar"],
  ["/notes", "notes"],
  ["/projects", "projects"],
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
