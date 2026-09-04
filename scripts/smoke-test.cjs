/**
 * End-to-end check of the data layer: quick-add parsing, recurrence, dependencies,
 * focus, postponing, note links and the project focus score.
 * Run with `npm run test:flows` (uses a throwaway database).
 */
const Module = require("node:module");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const dbPath = path.join(process.cwd(), "data", `smoke-${Date.now()}.db`);
process.env.GROWLY_DB = dbPath;

// The data layer targets the Next.js server runtime; stub the two imports that
// only exist there, then load the compiled data layer from .smoke/.
const STUB = path.join(__dirname, "stub.js");
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === "server-only" || request === "next/cache") return STUB;
  return resolve.call(this, request, ...rest);
};

const actions = require("../.smoke/actions.js");
const queries = require("../.smoke/queries.js");
const { quickAdd } = require("../.smoke/quickadd.js");
const util = require("../.smoke/util.js");

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

async function main() {

const today = util.todayISO();
const tomorrow = util.addDaysISO(today, 1);
let passed = 0;
const check = (label, fn) => {
  fn();
  passed += 1;
  console.log(`  ✓ ${label}`);
};

console.log("\nGrowly data-layer smoke test");

// --- projects ---------------------------------------------------------------
const projectId = await actions.createProject({ title: "Landing", area_id: "area_work" });

const inheritId = await actions.createTask({ title: "Inheriting task", project_id: projectId });
check("a task inherits its project's area rather than copying it", () => {
  const task = queries.getTask(inheritId);
  assert.equal(task.area_id, null, "no direct area on the task");
  assert.equal(task.area_name, "Work", "area resolved through the project");
  assert.equal(task.project_title, "Landing");
});

const milestoneProject = queries.listMilestones({ projectId });
await actions.createMilestone(projectId, "Page live", today);
check("a milestone hangs off its project", () => {
  assert.equal(milestoneProject.length, 0);
  const after = queries.listMilestones({ projectId });
  assert.equal(after.length, 1);
  assert.equal(after[0].project_title, "Landing");
});

// --- quick add --------------------------------------------------------------
const quickId = await quickAdd("Draft hero copy @Landing #writing * today 14:00 45m");
check("quick-add parses project, tag, priority, day, time and estimate", () => {
  const task = queries.getTask(quickId);
  assert.equal(task.title, "Draft hero copy");
  assert.equal(task.project_id, projectId);
  assert.equal(task.important, 1);
  assert.equal(task.scheduled_date, today);
  assert.equal(task.start_min, 14 * 60);
  assert.equal(task.estimate_minutes, 45);
  assert.equal(task.end_min, 14 * 60 + 45);
  assert.deepEqual(task.tags.map((t) => t.name), ["writing"]);
});

const unmatchedId = await quickAdd("Call the bank @NoSuchProject due:tomorrow !");
check("an unmatched @reference stays in the title instead of vanishing", () => {
  const task = queries.getTask(unmatchedId);
  assert.equal(task.title, "Call the bank @NoSuchProject");
  assert.equal(task.urgent, 1);
  assert.equal(task.due_date, tomorrow);
});

// --- recurrence -------------------------------------------------------------
const recurringId = await actions.createTask({
  title: "Weekly review",
  recurrence: "weekly",
  scheduled_date: today,
  status: "planned",
});
await actions.setTaskStatus(recurringId, "done");
check("completing a recurring task spawns the next occurrence", () => {
  const all = queries.listTasks({ includeDone: true, search: "Weekly review" });
  assert.equal(all.length, 2, "original plus next occurrence");
  const next = all.find((t) => t.id !== recurringId);
  assert.equal(next.scheduled_date, util.addDaysISO(today, 7));
  assert.equal(next.status, "planned");
  assert.equal(next.series_id, recurringId, "instances share a series");
});

// --- dependencies -----------------------------------------------------------
const firstId = await actions.createTask({ title: "Write copy" });
const secondId = await actions.createTask({ title: "Deploy page" });
await actions.addDependency(secondId, firstId);
check("a task with an open dependency reports as blocked", () => {
  assert.equal(queries.getTask(secondId).blocked_by, 1);
});
await actions.setTaskStatus(firstId, "done");
check("finishing the dependency unblocks it", () => {
  assert.equal(queries.getTask(secondId).blocked_by, 0);
});

// --- focus, postponing, time ------------------------------------------------
await actions.toggleFocus(today, quickId);
check("focus marks the task and pins it to that day", () => {
  const task = queries.getTask(quickId);
  assert.equal(task.is_focus, 1);
  assert.equal(queries.listTasks({ focusDate: today }).length, 1);
});

await actions.postponeTask(quickId, 1);
check("postponing moves the day and counts the slip", () => {
  const task = queries.getTask(quickId);
  assert.equal(task.scheduled_date, tomorrow);
  assert.equal(task.postponed_count, 1);
});

await actions.logTime(quickId, 30);
check("logged time rolls up to the project it serves", () => {
  assert.equal(queries.loggedMinutes(quickId), 30);
  const perProject = queries.timePerProject(today, today);
  const row = perProject.find((r) => r.project_id === projectId);
  assert.equal(row.minutes, 30);
});

// --- capacity and project focus ---------------------------------------------
await actions.updateSettings({ daily_capacity_min: "60" });
await actions.createTask({ title: "Long block", scheduled_date: today, estimate_minutes: 240 });
check("planning past the daily capacity raises the over-capacity flag", () => {
  const capacity = queries.capacityForDay(today);
  assert.equal(capacity.over, true);
  assert.ok(capacity.planned >= 240);
});

check("project focus score counts work that belongs to a project", () => {
  const focus = queries.projectFocusScore(today, tomorrow);
  assert.ok(focus.total > 0);
  assert.ok(focus.grouped > 0);
  assert.ok(focus.score > 0 && focus.score <= 100);
});

// --- notes ------------------------------------------------------------------
const targetNote = await actions.createNote({ title: "Positioning", content: "The one sentence." });
const sourceNote = await actions.createNote({
  title: "Kickoff",
  content: "Talked about [[Positioning]].\n- [ ] Send the deck\n",
  project_id: projectId,
});
check("[[wiki links]] create backlinks", () => {
  const backlinks = queries.getBacklinks(targetNote);
  assert.equal(backlinks.length, 1);
  assert.equal(backlinks[0].id, sourceNote);
});

const fromLineId = await actions.noteLineToTask(sourceNote, "- [ ] Send the deck");
check("a note line becomes a task that keeps the note's context", () => {
  const task = queries.getTask(fromLineId);
  assert.equal(task.title, "Send the deck");
  assert.equal(task.project_id, projectId);
  assert.match(task.notes, /Kickoff/);
});

// --- search -----------------------------------------------------------------
check("search spans tasks, notes and projects", () => {
  assert.ok(queries.search("Landing").projects.length >= 1, "matches a project");
  assert.ok(queries.search("hero").tasks.length >= 1, "matches a task title");
  assert.ok(queries.search("Positioning").notes.length >= 1, "matches a note");
});

console.log(`\n${passed} checks passed.\n`);
for (const suffix of ["", "-wal", "-shm"]) {
  fs.rmSync(`${dbPath}${suffix}`, { force: true });
}
}
