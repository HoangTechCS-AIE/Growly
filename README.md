# Growly

A local-first planner that keeps daily work attached to the projects it belongs to.

The point is not "calendar + notes + tasks". It is being able to answer, at any
moment: **what I am doing today moves which project forward?**

```
Area (Work, Health, Learning…)
  └── Project
        └── Task  ← carries a short-term outcome and a long-term contribution
```

A task inherits its area through its project, so putting a task in a project is
enough for it to count toward that project — and for the dashboard to show how
much of this week actually belongs to one.

## Running it

```bash
npm install
npm run seed     # optional: a worked example (2 projects → tasks → notes)
npm run dev      # http://localhost:3000
```

The first visit opens a setup screen: pick the username and password that will
open Growly from then on. One account guards the whole app — there is no sharing
and no per-user data. Sign out again from Settings.

Everything lives in `data/growly.db` (SQLite through Node's built-in `node:sqlite`,
so there is no native build step). Nothing leaves the machine — back it up by
copying that file. Beside it sits `data/.session-key`, the key that signs session
cookies; delete it to sign every browser out, or set `GROWLY_SECRET` instead.

```bash
npm run build && npm start   # production mode
npm run test:flows           # data-layer smoke test on a throwaway database
```

`scripts/browser-test.mjs` covers what those cannot: real clicks, drag and drop,
autosave, the mobile More sheet, the theme toggle and colour contrast. It needs
Chrome plus `npm i -D puppeteer-core`, and a server pointed at a throwaway
database — the recipe is in the file's header.

## What is in it

**Today** — the Big 3 for the day, today's time blocks against a capacity meter,
overdue work, an inbox to triage, active projects with progress, open tasks per
area, a project focus score (share of this week's work that belongs to a project)
and the drift list: repeatedly postponed tasks and stalled projects.

**Tasks** — list grouped by date, Kanban board (Inbox / Planned / Doing / Waiting /
Done, drag to move), Eisenhower matrix (drag to reclassify) and a 13-week project
timeline with milestones. Every task holds a short-term outcome, a long-term
contribution, a next action, a checklist, dependencies ("waits for"), tags, an
estimate, logged time, recurrence and full history — and, once finished, the three
closing questions: did the result match the expectation, did it move the project,
what is the next step.

**Calendar** — day / week / month, full width. A task with a day but no hour sits
in the **No time** row under the day headers, where you can see it without
scrolling and drag it down onto an hour; drop a block back up there to keep the
day and drop the time. Drag a block's bottom edge to change its duration, or
click an empty slot to plan something there. Deadlines and project milestones sit
in the day header; each day shows planned time against your daily capacity and
flags the days you have over-committed. Tasks with no day at all appear in a
strip above the grid — and only when there are any.

**Notes** — Markdown with live preview, `[[wiki links]]` and backlinks, daily
notes, templates (weekly review, brainstorm, planning, meeting, project), pin, tag
and archive — plus **Line → task**: select lines and turn them into tasks that
inherit the note's project.

**Projects** — one page per project: its tasks, its dated milestones (they show up
on the calendar and the timeline too) and the notes filed under it.

## Interface

**Bento, not boxes-in-boxes.** Every screen is a grid of rounded tiles on a
warm neutral canvas, set in Plus Jakarta Sans on one type scale
(12 · 13 · 15 · 17 · 20 · 24 · 30 · 36). Today leads with one deep-green
spotlight tile — the block running now, the next one, or the first of the
Big 3 — and every task row spells out where it sits: project → area.
Tags are kept to the ones that change what you do next (blocked, waiting,
due); everything else lives on the task page. Icons are one stroke family of
inline SVGs; there are no emoji or text glyphs standing in for controls.

**Light and dark.** The palette follows the system by default; the toggle in the
header cycles system → light → dark and remembers the choice. A tiny inline
script applies it before the first paint, so there is no flash. Every colour is
a role (`--ink`, `--muted`, `--accent`, `--surface`…) defined once per theme.
**Settings → Accent** swaps the accent for one of six presets — green, blue,
violet, amber, rose, slate — stamped on `<html>` by the server, so it is right
on the first paint too. Each preset states its own light and dark values and
every accent/label pair clears WCAG AA, which is why it is a fixed list rather
than a free colour picker. Project and area colours are unaffected: they are
hues that derive their chip, dot, tile and
calendar-block styles through `color-mix`, so a new colour needs no per-theme
classes. Every text pair clears WCAG AA and the `browser-test` script measures it.

**Phone and desktop.** From `lg` up an icon rail sits on the left; below it the
app gets a bottom tab bar (Today, Tasks, Calendar, Notes, More — the More sheet
holds Projects, Search and Settings; Escape closes it and
focus returns to the button). The header is one thin strip, the board turns into a
snap-scrolling carousel, the calendar opens on the day view, and the week grid and timeline scroll horizontally instead of
crushing their columns. No page scrolls sideways on a 390px screen.

**Keyboard and pointer-free use.** One visible focus ring on everything
focusable, a skip link, `aria-current` on the active nav item, accessible names
on every icon-only button and unlabelled select, `aria-pressed` on view
switchers, live regions for autosave feedback, and
`prefers-reduced-motion` honoured. Drag and drop is pointer-only by nature, so
every drag has a non-drag equivalent: click an empty calendar slot to plan
something there, or set the day, time and status on the task itself.

## Layout

```
app/          routes: today (/), tasks, calendar, notes, projects, settings
components/   UI — client components own interaction, pages stay server components
deploy/       compose file, remote deploy script and Caddy block for the server
proxy.ts      the gate: no valid session cookie, no app
lib/
  schema.sql  the whole data model
  db.ts       lazy SQLite connection + helpers
  auth.ts     accounts, password hashing, sessions
  auth-token.ts  signs and reads the session cookie (also used by proxy.ts)
  queries.ts  every read (area inheritance, project focus, capacity, drift)
  actions.ts  every write, as server actions
  quickadd.ts the quick-add parser — kept, but nothing in the UI calls it
  markdown.ts note renderer + templates
scripts/      seed.mjs, smoke-test.cjs, browser-test.mjs
```

## Not built yet

Google Calendar sync, collaboration, a native mobile app, notifications, AI
assistance. Touch drag-and-drop is not implemented either — on a phone, use the
click-to-plan and task fields instead.
The first thing worth proving is whether this actually turns a plan into daily
action; everything else can wait for that answer.
