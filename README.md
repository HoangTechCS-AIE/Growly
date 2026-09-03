# Growly

A local-first planner that keeps daily work attached to long-term strategy.

The point is not "calendar + notes + tasks". It is being able to answer, at any
moment: **what I am doing today serves which long-term goal?**

```
Vision (3–5 years)
  └── Goal (6–12 months)
        └── Strategy (1–12 weeks)
              └── Project
                    └── Task  ← carries a short-term outcome and a long-term contribution
```

A task inherits its goal through its project and strategy, so linking a task to a
project is enough for it to count toward the goal — and for the dashboard to show
how much of this week actually ladders up to something.

## Running it

```bash
npm install
npm run seed     # optional: a worked example (vision → goal → sprint → projects → tasks → notes)
npm run dev      # http://localhost:3000
```

Everything lives in `data/growly.db` (SQLite through Node's built-in `node:sqlite`,
so there is no native build step). Nothing leaves the machine — back it up by
copying that file.

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
overdue work, an inbox to triage, active goals with progress, time invested per
goal, an alignment score (share of this week's work that serves a goal) and the
drift list: repeatedly postponed tasks, stalled projects, idle goals.

**Tasks** — list grouped by date, Kanban board (Inbox / Planned / Doing / Waiting /
Done, drag to move), Eisenhower matrix (drag to reclassify) and a 13-week project
timeline with milestones. Every task holds a short-term outcome, a long-term
contribution, a next action, a checklist, dependencies ("waits for"), tags, an
estimate, logged time, recurrence and full history — and, once finished, the three
closing questions: did the result match the expectation, did it move a goal, what
is the next step.

**Calendar** — day / week / month. Drag from the unscheduled rail onto the grid to
block time, drag a block's bottom edge to change its duration. Deadlines and
project milestones sit in the day header; each day shows planned time against your
daily capacity and flags the days you have over-committed.

**Notes** — Markdown with live preview, `[[wiki links]]` and backlinks, daily
notes, templates (weekly review, brainstorm, planning, meeting, project), pin, tag
and archive — plus **Line → task**: select lines and turn them into tasks that
inherit the note's project and goal.

**Review** — daily, weekly and monthly. Each review is pre-filled with real data
(what was completed, what is still open, time per goal, alignment, drift), so the
page is never blank, and answers are stored per period.

**Search** — one box across tasks, notes, projects and goals. Press `/` or
`⌘K` / `Ctrl+K` anywhere for the palette, which also quick-adds a task.

## Interface

**Bento, not boxes-in-boxes.** Every screen is a grid of rounded tiles on a
warm neutral canvas, set in Plus Jakarta Sans on one type scale
(12 · 13 · 15 · 17 · 20 · 24 · 30 · 36). Today leads with one deep-green
spotlight tile — the block running now, the next one, or the first of the
Big 3 — and every task row spells out the ladder it climbs: project → goal.
Tags are kept to the ones that change what you do next (blocked, waiting,
due); everything else lives on the task page. Icons are one stroke family of
inline SVGs; there are no emoji or text glyphs standing in for controls.

**Light and dark.** The palette follows the system by default; the toggle in the
header cycles system → light → dark and remembers the choice. A tiny inline
script applies it before the first paint, so there is no flash. Every colour is
a role (`--ink`, `--muted`, `--accent`, `--surface`…) defined once per theme;
project and area colours are hues that derive their chip, dot, tile and
calendar-block styles through `color-mix`, so a new colour needs no per-theme
classes. Every text pair clears WCAG AA and the `browser-test` script measures it.

**Phone and desktop.** From `lg` up an icon rail sits on the left; below it the
app gets a bottom tab bar (Today, Tasks, Calendar, Notes, More — the More sheet
holds Projects, Strategy, Review, Search and Settings; Escape closes it and
focus returns to the button). The header collapses to one row plus a full-width
quick add, the board turns into a snap-scrolling carousel, the calendar opens on
the day view, and the week grid and timeline scroll horizontally instead of
crushing their columns. No page scrolls sideways on a 390px screen.

**Keyboard and pointer-free use.** One visible focus ring on everything
focusable, a skip link, `aria-current` on the active nav item, accessible names
on every icon-only button and unlabelled select, `aria-pressed` on view
switchers, live regions for quick-add and autosave feedback, and
`prefers-reduced-motion` honoured. Drag and drop is pointer-only by nature, so
every drag has a non-drag equivalent: click an empty calendar slot to plan
something there, or set the day, time and status on the task itself.

## Quick-add syntax

Type into the bar at the top of every page:

```
Draft hero copy @Landing ~Validate /Work #writing * today 14:00 45m
```

| Token | Meaning |
|---|---|
| `@name` | project (`@"two words"` for spaces) |
| `~name` | goal |
| `/name` | area (Work, Health, Learning…) |
| `#tag` | tag, created if new |
| `*` / `!` | important / urgent |
| `today`, `tmr`, `fri`, `2026-08-20`, `20/8` | scheduled day |
| `due:friday` | deadline |
| `14:00` | start of the time block |
| `45m`, `1h30` | estimate |
| `every day` / `weekday` / `week` / `month` | repeat |

An `@name` that matches nothing stays in the title instead of disappearing.

## Layout

```
app/          routes: today (/), tasks, calendar, notes, strategy, review, search, settings
components/   UI — client components own interaction, pages stay server components
lib/
  schema.sql  the whole data model
  db.ts       lazy SQLite connection + helpers
  queries.ts  every read (goal inheritance, alignment, capacity, drift)
  actions.ts  every write, as server actions
  quickadd.ts the quick-add parser
  markdown.ts note renderer + templates
scripts/      seed.mjs, smoke-test.cjs, browser-test.mjs
```

## Not built yet

Google Calendar sync, collaboration, a native mobile app, notifications, AI
assistance. Touch drag-and-drop is not implemented either — on a phone, use the
click-to-plan and task fields instead.
The first thing worth proving is whether this actually turns strategy into daily
action; everything else can wait for that answer.
