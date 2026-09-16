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

Needs **Node 22.5 or newer** — the data layer uses the built-in `node:sqlite`, which
does not exist on Node 20 (`ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite`).

```bash
cp .env.example .env   # club identity, AI provider, limits — nothing is hardcoded
npm install
npm run seed     # optional: a worked example (2 projects → tasks → notes)
npm run dev      # http://localhost:3000
```

`.env.example` documents every setting. `.env` is gitignored; Next loads it
automatically and the scripts under `scripts/` read it through
`--env-file-if-exists`, so one file covers both. Values entered in Settings → AI
provider are stored in the database and override the `OPENAI_*` entries there.
Quote any value that starts with `#` — an unquoted one is read as a comment.

The first visit opens a setup screen: pick the username and password that will
open Growly from then on. One account guards the whole app — there is no sharing
and no per-user data. Sign out again from Settings.

Everything lives in `data/growly.db` (SQLite through Node's built-in `node:sqlite`,
so there is no native build step). Nothing leaves the machine. The connection runs
in WAL mode, so recent writes sit in `data/growly.db-wal` until SQLite checkpoints
them — copying `growly.db` on its own can therefore miss the newest work. Back up
all three files together, or checkpoint first:

```bash
node -e "new (require('node:sqlite').DatabaseSync)('data/growly.db').exec('PRAGMA wal_checkpoint(TRUNCATE)')"
cp data/growly.db backup.db
```

Beside them sits `data/.session-key`, the key that signs session cookies; delete
it to sign every browser out, or set `GROWLY_SECRET` instead.

### Crawling the fanpage archive

Content needs real posts to learn the voice from. With admin rights on the page,
pull them over the Graph API rather than scraping:

1. Open [Graph API Explorer](https://developers.facebook.com/tools/explorer),
   pick (or create) an app, and add the `pages_read_engagement` and
   `pages_read_user_content` permissions.
2. Switch the token dropdown to a **Page access token** for the fanpage — a user
   token cannot read `/published_posts`.
3. Extend it before a long crawl; the Explorer hands out short-lived tokens that
   expire in about an hour. The Access Token Debugger has an *Extend* button.
4. Put the token and the page ID in `.env` as `FB_PAGE_TOKEN` and `FB_PAGE_ID`.

```bash
npm run crawl:posts -- --dry-run        # check the token and count what is there
npm run crawl:posts                     # write data/<post_id>/post.json
npm run crawl:posts -- --since=2024-01-01
npm run import:posts                    # load them into fb_posts
```

On the server the same two steps run inside the container, which mounts the
archive from `/opt/growly/data` and reads the token from `/opt/growly/.env`:

```bash
docker exec growly node scripts/crawl-posts.mjs
docker exec growly node scripts/import-posts.mjs
docker restart growly   # the Content page caches the corpus stats per request
```

Both steps are safe to re-run: the crawler overwrites each post's own file and
the importer upserts by post id, so a later pass picks up new and edited posts
without disturbing the rest. Posts without text are skipped — a photo dump
teaches nothing about the writing. The importer prints a count per category;
a large `khac` bucket means the title patterns in `scripts/import-posts.mjs`
do not match how this page names its posts.

```bash
npm run build && npm start   # production mode
npm run test:flows           # data-layer smoke test on a throwaway database
npm run test:content         # content pipeline against a stub OpenAI-compatible server
npm run test:document        # .docx/.pdf → brief → post, same stub server
npm run lint:corpus          # score every real post to keep the content linter honest
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

**Content** — writes Facebook posts for a club page in that page's own voice.
Point it at an archive of the page's real posts (`data/<post_id>/post.json`, then
`npm run import:posts`). Start from a blank brief, or drop in the source notice
as **.docx or .pdf**: the text is pulled out locally — Word tables keep their
rows paired, and the reader is the ZIP spec rather than a dependency — then read
once at temperature 0 to fill in the post type, topic and hard facts. That pass
copies only what the document says and reports what it cannot reconcile (a
notice dated 2025 whose every deadline is 2026 comes back as a warning, not a
silent guess), so you check the facts before a word is written. From there it
picks three genuine posts of the same kind as few-shot examples, prompts any
OpenAI-compatible endpoint with the measured house style, and scores the result
against a 15-point linter — length, paragraph shape, emoji used as field labels
rather than decoration, pronoun consistency, sentence-final particles, banned
essay connectives, footer and hashtags. A draft that fails goes back for one
repair pass; whatever still fails is shown rather than hidden, and the score
updates live as you edit. The rules and every number behind them are in
`docs/hit-content-rules.md`; `npm run lint:corpus` re-scores the real archive, so
if genuine posts start failing, the linter is wrong and says so. Nothing about
one particular club is baked into the code — the name, fanpage, address and
hashtags all come from `.env`, and the linter is handed the footer marker rather
than assuming it, so pointing this at another page is a config change.

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
app/          routes: today (/), tasks, calendar, notes, projects, strategy, review,
              content, settings
components/   UI — client components own interaction, pages stay server components
deploy/       compose file, remote deploy script and Caddy block for the server
proxy.ts      the gate: no valid session cookie, no app
lib/
  config.ts   every deployment value, read from .env (server-only)
  schema.sql  the whole data model
  db.ts       lazy SQLite connection + helpers
  auth.ts     accounts, password hashing, sessions
  auth-token.ts  signs and reads the session cookie (also used by proxy.ts)
  queries.ts  every read (area inheritance, project focus, capacity, drift)
  actions.ts  every write, as server actions
  quickadd.ts the quick-add parser — kept, but nothing in the UI calls it
  markdown.ts note renderer + templates
  content/    rules.ts (the voice, as data), lint.ts (the 15 checks), corpus.ts,
              prompt.ts, provider.ts (OpenAI-compatible client), generate.ts,
              extract.ts (.docx/.pdf → text), analyze.ts (document → brief)
scripts/      seed.mjs, smoke-test.cjs, browser-test.mjs, import-posts.mjs,
              lint-corpus.cjs, test-generate.cjs, test-document.cjs
```

## Not built yet

Google Calendar sync, collaboration, a native mobile app, notifications. Touch
drag-and-drop is not implemented either — on a phone, use the click-to-plan and
task fields instead. AI is limited to the Content page and stays opt-in: nothing
calls out until you set a provider in Settings.
The first thing worth proving is whether this actually turns strategy into daily
action; everything else can wait for that answer.
