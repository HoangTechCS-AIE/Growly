/**
 * Seeds Growly with a small worked example: two projects with milestones, tasks
 * that carry short-term/long-term intent, notes and a few time logs.
 * Run with `npm run seed`.
 */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const dbPath = process.env.GROWLY_DB ?? path.join(root, "data", "growly.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath, { timeout: 5000 });
db.exec("PRAGMA foreign_keys = ON;");
db.exec(fs.readFileSync(path.join(root, "lib", "schema.sql"), "utf8"));

const now = new Date().toISOString();
const iso = (d) => {
  const x = new Date();
  x.setDate(x.getDate() + d);
  return `${x.getFullYear()}-${`${x.getMonth() + 1}`.padStart(2, "0")}-${`${x.getDate()}`.padStart(2, "0")}`;
};
const today = iso(0);
const id = () => crypto.randomUUID();
const run = (sql, ...params) => db.prepare(sql).run(...params);

const existing = db.prepare("SELECT COUNT(*) AS n FROM projects").get();
if (existing.n > 0) {
  console.log("Database already has projects — seed skipped. Delete data/growly.db to start over.");
  process.exit(0);
}

for (const [key, value] of Object.entries({
  day_start_min: "480",
  day_end_min: "1320",
  daily_capacity_min: "360",
  week_starts_on: "1",
})) {
  run("INSERT OR IGNORE INTO settings(key, value) VALUES(?, ?)", key, value);
}

const areas = {
  work: "area_work",
  health: "area_health",
  learning: "area_learning",
  personal: "area_personal",
};
[
  [areas.work, "Work", "indigo", 0],
  [areas.health, "Health", "emerald", 1],
  [areas.learning, "Learning", "amber", 2],
  [areas.personal, "Personal", "rose", 3],
].forEach(([aid, name, color, position]) =>
  run(
    "INSERT OR IGNORE INTO areas(id, name, color, position, created_at) VALUES(?, ?, ?, ?, ?)",
    aid, name, color, position, now,
  ),
);

const landingId = id();
const interviewsId = id();
run(
  `INSERT INTO projects(id, area_id, title, description, status, start_date,
     due_date, color, position, created_at, updated_at)
   VALUES(?, ?, ?, ?, 'active', ?, ?, 'indigo', 0, ?, ?)`,
  landingId, areas.work,
  "Landing page",
  "A page that explains the promise clearly enough for a stranger to sign up.",
  today, iso(21), now, now,
);
run(
  `INSERT INTO projects(id, area_id, title, description, status, start_date,
     due_date, color, position, created_at, updated_at)
   VALUES(?, ?, ?, ?, 'active', ?, ?, 'emerald', 1, ?, ?)`,
  interviewsId, areas.work,
  "User interviews",
  "Twenty conversations, same five questions, verbatim notes.",
  today, iso(45), now, now,
);

run(
  "INSERT INTO milestones(id, project_id, title, date, done, created_at) VALUES(?, ?, ?, ?, 0, ?)",
  id(), landingId, "Landing page live", iso(14), now,
);
run(
  "INSERT INTO milestones(id, project_id, title, date, done, created_at) VALUES(?, ?, ?, ?, 0, ?)",
  id(), interviewsId, "20 interviews completed", iso(42), now,
);

const tags = {};
for (const name of ["deep-work", "writing", "research"]) {
  const tid = id();
  tags[name] = tid;
  run("INSERT INTO tags(id, name, color, created_at) VALUES(?, ?, 'slate', ?)", tid, name, now);
}

function task(fields) {
  const tid = id();
  run(
    `INSERT INTO tasks(id, title, notes, short_term_outcome, long_term_contribution, next_action,
       project_id, area_id, parent_id, status, important, urgent, estimate_minutes,
       due_date, scheduled_date, start_min, end_min, waiting_on, recurrence, series_id,
       completed_at, postponed_count, position, created_at, updated_at)
     VALUES($id, $title, $notes, $sto, $ltc, $next, $project, $area, $parent, $status,
       $important, $urgent, $estimate, $due, $sched, $start, $end, $waiting, $rec, $series,
       $completed, $postponed, 0, $now, $now)`,
    {
      id: tid,
      title: fields.title,
      notes: fields.notes ?? null,
      sto: fields.sto ?? null,
      ltc: fields.ltc ?? null,
      next: fields.next ?? null,
      project: fields.project ?? null,
      area: fields.area ?? null,
      parent: fields.parent ?? null,
      status: fields.status ?? "planned",
      important: fields.important ? 1 : 0,
      urgent: fields.urgent ? 1 : 0,
      estimate: fields.estimate ?? null,
      due: fields.due ?? null,
      sched: fields.sched ?? null,
      start: fields.start ?? null,
      end: fields.end ?? null,
      waiting: fields.waiting ?? null,
      rec: fields.rec ?? null,
      series: fields.rec ? tid : null,
      completed: fields.completed ?? null,
      postponed: fields.postponed ?? 0,
      now,
    },
  );
  for (const tag of fields.tags ?? []) {
    run("INSERT OR IGNORE INTO task_tags(task_id, tag_id) VALUES(?, ?)", tid, tags[tag]);
  }
  run(
    "INSERT INTO task_events(id, task_id, kind, detail, created_at) VALUES(?, ?, 'created', 'seed', ?)",
    id(), tid, now,
  );
  return tid;
}

const copyTask = task({
  title: "Write the landing page copy",
  sto: "A page I can put in front of 20 people this week.",
  ltc: "Validates demand before I build the full product — the whole point of the 8-week sprint.",
  next: "Draft the headline and the three-line promise.",
  project: landingId,
  important: true,
  estimate: 90,
  sched: today,
  start: 14 * 60,
  end: 14 * 60 + 90,
  due: iso(3),
  tags: ["writing", "deep-work"],
});

task({ title: "Headline that names the problem", parent: copyTask, project: landingId, status: "done", completed: now });
task({ title: "Three-line promise", parent: copyTask, project: landingId, status: "planned" });
task({ title: "Sign-up form + confirmation email", parent: copyTask, project: landingId, status: "planned" });

const deployTask = task({
  title: "Deploy the landing page",
  sto: "The page is reachable at a real URL.",
  ltc: "No validation happens until strangers can see it.",
  project: landingId,
  estimate: 60,
  sched: iso(1),
  start: 9 * 60,
  end: 10 * 60,
  important: true,
});
run("INSERT INTO task_deps(task_id, depends_on_id) VALUES(?, ?)", deployTask, copyTask);

task({
  title: "Interview 5 early users",
  sto: "Five recorded conversations with notes.",
  ltc: "Tells me which half of the roadmap to delete.",
  next: "Send the scheduling link to the first five names.",
  project: interviewsId,
  important: true,
  estimate: 150,
  sched: iso(2),
  start: 10 * 60,
  end: 12 * 60 + 30,
  tags: ["research"],
});

task({
  title: "Waiting on design feedback from Minh",
  status: "waiting",
  waiting: "Minh",
  project: landingId,
  sched: iso(1),
});

task({
  title: "Weekly review",
  sto: "A clear picture of what moved and what stalled.",
  ltc: "Keeps the plan honest instead of drifting.",
  rec: "weekly",
  estimate: 45,
  sched: iso(6),
  start: 17 * 60,
  end: 17 * 60 + 45,
  important: true,
});

task({
  title: "Train — strength session",
  area: areas.health,
  rec: "weekly",
  estimate: 60,
  sched: today,
  start: 18 * 60,
  end: 19 * 60,
});

task({
  title: "Read one chapter of Thinking in Systems",
  area: areas.learning,
  estimate: 30,
  status: "inbox",
});

task({ title: "Look into a cheaper email provider", status: "inbox" });
task({ title: "Fix the invoice from last month", status: "inbox", urgent: true, due: iso(-1) });
task({
  title: "Rewrite the pricing section",
  project: landingId,
  status: "planned",
  postponed: 3,
  sched: iso(1),
});

const done1 = task({
  title: "Sketch the information architecture",
  project: landingId,
  status: "done",
  completed: new Date(Date.now() - 26 * 3600 * 1000).toISOString(),
  estimate: 60,
});

run("INSERT INTO time_logs(id, task_id, date, minutes, note, created_at) VALUES(?, ?, ?, ?, NULL, ?)", id(), done1, iso(-1), 75, now);
run("INSERT INTO time_logs(id, task_id, date, minutes, note, created_at) VALUES(?, ?, ?, ?, NULL, ?)", id(), copyTask, today, 45, now);

run("INSERT OR IGNORE INTO day_focus(date, task_id, position) VALUES(?, ?, 0)", today, copyTask);

const noteId = id();
run(
  `INSERT INTO notes(id, title, content, kind, date, project_id, task_id, pinned, archived,
     created_at, updated_at)
   VALUES(?, ?, ?, 'meeting', ?, ?, NULL, 1, 0, ?, ?)`,
  noteId,
  "Kickoff call with the first two testers",
  `## Context
Two people who plan their week on paper today.

## What they said
- Calendars show *when*, never *why*.
- Weekly reviews die because nothing prepares them.
- They want the day plan to be defensible: "this is why I said no".

## Decisions
- The capacity ring stays on the dashboard.
- The day plan explains itself, rather than showing a blank page.

## Action items
- [ ] Add "why this task" to the daily view
- [ ] Show completed tasks on the week's bars
- [ ] Send both testers the landing page when it is live

See also [[Positioning notes]].`,
  today, landingId, now, now,
);

run(
  `INSERT INTO notes(id, title, content, kind, date, project_id, task_id, pinned, archived,
     created_at, updated_at)
   VALUES(?, ?, ?, 'project', NULL, ?, NULL, 0, 0, ?, ?)`,
  id(),
  "Positioning notes",
  `## The one sentence
Growly turns a plan into what you do today — and shows you the link.

## Not competing on
- Prettiest calendar
- Team collaboration

## Competing on
- Every task states its short-term outcome and long-term contribution
- A day plan you can defend`,
  landingId, now, now,
);

console.log(`Seeded ${dbPath}`);
console.log("2 projects → 13 tasks → 2 notes.");
