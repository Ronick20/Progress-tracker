# Habit Tracker

A monthly habit tracker: your habits are rows, every day of the selected month is a
column, and clicking a cell marks that habit complete for that day. Habits are yours
to add, rename and delete from the app itself, and below the grid two panels hold the
day's tasks — the ones you wrote out the day before, ready to tick off — and the plan
you are writing for tomorrow. Your data lives in a Supabase (PostgreSQL) database, so
the same tracker follows you from your Linux desktop to Windows to your phone.

## Tech stack

- Next.js 16 (App Router)
- React 19
- TypeScript
- Tailwind CSS v4
- Supabase (PostgreSQL) via `@supabase/supabase-js`

## Phases

- **Phase 1** — the grid, month navigation and toggling, persisted to `localStorage`.
- **Phase 2** — the same UI, backed by a cloud PostgreSQL database through
  Supabase. `localStorage` is no longer a source of truth; it is read once, to migrate
  any Phase 1 data into the database.
- **Phase 3 (current)** — the tracker is editable from the app: habits are added,
  renamed and deleted in place, today's date heads the page, and a daily tasks
  section below the grid carries tomorrow's plan into tomorrow's checklist.

**Upgrading from Phase 2?** Run
[`supabase/migrations/0001_phase3_tasks_and_habit_writes.sql`](supabase/migrations/0001_phase3_tasks_and_habit_writes.sql)
in the Supabase SQL editor. It adds the `daily_tasks` table and the write policies on
`habits` — without it, adding a habit fails with *"new row violates row-level security
policy"* and the tasks panel cannot load. It is idempotent and touches no existing
rows.

Prefer the migration over re-running `schema.sql` on an existing database:
`schema.sql` ends with a seed insert that would bring back any of the twelve starting
habits you have since deleted.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create the Supabase project

1. Create a free project at [supabase.com](https://supabase.com/dashboard).
2. Open **SQL Editor → New query**, paste the contents of
   [`supabase/schema.sql`](supabase/schema.sql) and run it.

That script creates all three tables, the unique constraint, the foreign key, the
`updated_at` triggers, the row level security policies, and seeds twelve starting
habits. It is idempotent — running it twice will not duplicate anything.

`supabase/migrations/` holds the delta scripts for upgrading a database that was set
up under an earlier phase; a brand-new project needs only `schema.sql`.

### 3. Environment variables

Copy the template and fill it in from **Project Settings → API**:

```bash
cp .env.example .env.local
```

| Variable                        | Where to find it            | Notes                                    |
| ------------------------------- | --------------------------- | ---------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Project Settings → API      | e.g. `https://xxxxxxxx.supabase.co`      |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Project Settings → API      | the `anon` / publishable key             |

`.env.local` is git-ignored and must never be committed. The **service role key is
not used anywhere in this app** and must never be placed in a `NEXT_PUBLIC_*`
variable — it bypasses row level security and would be shipped to the browser.

Next.js inlines `NEXT_PUBLIC_*` variables at build time, so restart the dev server
after editing `.env.local`.

### 4. Run it

```bash
npm run dev     # http://localhost:3000
```

To reach it from your phone on the same network, run `npm run dev -- -H 0.0.0.0` and
open `http://<your-computer-ip>:3000`.

## Development commands

```bash
npm run dev       # dev server
npm run build     # production build
npm run start     # serve the production build
npm run check:db  # is the database reachable, and is its schema up to date?
npm run lint      # ESLint
npx tsc --noEmit  # type check
```

`npm run check:db` reads `.env.local`, then reads each table and round-trips one
inactive probe row through `habits` to prove the write policies exist. When something
is missing it names the migration to run and links straight to your project's SQL
editor. Use it whenever the app reports a database problem — it distinguishes a
missing migration from a genuine connection failure, which the browser cannot.

## Database schema

```text
habits                        habit_logs                        daily_tasks
----------------------        --------------------------        ---------------------------
id          uuid   PK         id          uuid   PK             id           uuid   PK
name        text              habit_id    uuid   FK             date         date
icon        text              date        date                  title        text
active      boolean           completed   boolean               description  text
sort_order  integer           created_at  timestamptz           completed    boolean
created_at  timestamptz       updated_at  timestamptz           sort_order   integer
                                                                created_at   timestamptz
                              unique (habit_id, date)           updated_at   timestamptz
```

- `habit_logs.habit_id` references `habits.id` with `on delete cascade`.
- `unique (habit_id, date)` guarantees at most one record per habit per day, which
  is what makes the upsert on toggle safe.
- `updated_at` is maintained by a `before update` trigger.
- `habit_logs (date)` is indexed, because every read is a one-month range scan.
- `daily_tasks` is standalone: a task belongs to a **date**, not to a habit, and
  `daily_tasks (date)` is indexed because the panels read exactly two days at a time.
- Deleting a habit deletes its logs through the cascade; deleting a task deletes only
  that row.
- `icon` is unused by the UI and is left `null`; it is there for a later phase and
  rendering it would change the existing layout.

## How data flows

```text
React components → lib/habits.ts, lib/habitLogs.ts → lib/supabase.ts
                 → Supabase API → PostgreSQL → habits, habit_logs
```

**Habits** are read once per page load from `habits`, filtered to `active = true`
and ordered by `sort_order`. There is no hardcoded habit list anywhere in the UI:

- **Add** — the field under the grid inserts a row with `sort_order` one past the
  last habit, and waits for the insert so the new row arrives with its real id.
- **Rename** — hover a habit and click the pencil, or press Enter in the field.
  Logs are keyed by habit id, so a rename keeps every tick.
- **Delete** — the bin icon, after a confirmation that spells out what is lost: the
  `on delete cascade` foreign key takes the habit's entire history with it.

Renames and deletes are optimistic and roll back if the write fails.

**Daily tasks** are read for exactly two dates — today and tomorrow — in one request:

```sql
select id, date, title, description, completed, sort_order
from daily_tasks
where date in ('2026-08-21', '2026-08-22')
order by sort_order, created_at;
```

What you write into **Tomorrow's plan** is stored against tomorrow's date, so when
that date arrives the same rows are what **Today's tasks** shows — with checkboxes.
Tomorrow's panel has no checkboxes on purpose: a day you are still planning has
nothing to tick yet. Each task carries its own optional description box, and ticking,
editing and deleting all roll back if the write fails.

**Monthly logs** are read one month at a time. Changing the month issues a single
query bounded by that month's first and last date:

```sql
select habit_id, date, completed
from habit_logs
where date >= '2026-08-01' and date <= '2026-08-31';
```

The whole grid is then built in memory, so a 31 × 12 month costs two requests on
first load and one request per month change — never one per cell.

**Toggling a cell** flips it in the UI immediately, then upserts exactly one row:

```sql
insert into habit_logs (habit_id, date, completed)
values (…, '2026-08-21', true)
on conflict (habit_id, date) do update set completed = excluded.completed;
```

Unticking writes `completed = false` to the same row rather than deleting it, so
there is a single code path and the row keeps its history. Rows with
`completed = false` are simply not rendered as ticked.

If a save fails, the optimistic change is **rolled back** and a message appears —
the UI never claims a save that did not happen. A failure whose PostgREST code says
the schema is behind (RLS denied the write, or the table is unknown) is reported as
"run the migration" rather than as a connection problem, because retrying it can
never succeed. Full offline support is out of scope.

The Supabase client retries a failed **read** three times with 1s/2s/4s backoff, so a
brief connection blip heals itself and a genuine outage takes roughly eight seconds to
surface as the error screen. Writes are not retried, so a failed toggle rolls back
promptly and can never be applied twice.

## Migrating Phase 1 data

On first load after upgrading, any completions found under the Phase 1 key
`habit-tracker.completions.v1` are uploaded to Supabase and a marker key,
`habit-tracker.migrated-to-supabase.v1`, records that it happened, so it never runs
twice. Because every write is an upsert on `(habit_id, date)`, even a repeat run
could not create duplicates. Phase 1 identified habits by slug and Phase 2 uses
UUIDs, so the two are matched by habit name; a legacy habit with no matching row in
the database is skipped rather than failing the migration.

The legacy entry is deliberately **not** deleted — nothing is destroyed if the
upload only partly succeeds — but it is never read again. To re-run the migration
by hand, delete `habit-tracker.migrated-to-supabase.v1` from the browser's
localStorage and reload. If you have Phase 1 data in more than one browser, open the
app once in each; each browser's data merges into the same database.

## Security and known limitations

- Row level security is **enabled** on all three tables. Because habits and tasks are
  now managed from the app, the policies grant the anon key full CRUD on `habits` and
  `daily_tasks`, and `select`/`insert`/`update` on `habit_logs` (unticking writes
  `completed = false` rather than deleting, so `habit_logs` still needs no delete
  policy).
- **There is no authentication yet, so there is no per-user isolation.** Anyone who
  has your project URL and anon key can read and write this data. That is acceptable
  for a single-user personal tracker but it is not multi-tenant. Do not publish those
  values, and treat the deployment as private. Authentication, and RLS policies that
  scope rows to `auth.uid()`, belong to a later phase.
- Dates are local-time `YYYY-MM-DD` keys, so a device set to a different time zone
  can disagree about which day "today" is near midnight.
- No offline support: with no network, loading shows an error with a retry, and
  toggling reverts.
- Unticking sets `completed = false` rather than deleting the row, so `habit_logs`
  keeps a row for every habit/date ever touched. That is intentional (one code path,
  and the row keeps its `created_at`), but it does mean the table never shrinks.
- Two devices editing the same cell at the same time is last-write-wins; there is no
  realtime subscription, so a second device sees the change on its next load.

## Project structure

```text
src/
├── app/
│   ├── layout.tsx               # root layout and metadata
│   ├── page.tsx                 # renders the tracker
│   └── globals.css              # Tailwind import, theme tokens, scrollbar styling
├── components/
│   ├── HabitTracker.tsx         # data loading, month navigation, habit CRUD, layout
│   ├── MonthSelector.tsx        # ← August 2026 → plus a "Today" shortcut
│   ├── CalendarHeader.tsx       # day-number / weekday column headers
│   ├── HabitRow.tsx             # one habit: sticky name cell (rename/delete) + cells
│   ├── HabitCell.tsx            # a single toggleable completion cell
│   ├── AddHabitForm.tsx         # the "Add a habit…" field under the grid
│   ├── DailyTasks.tsx           # loads today + tomorrow, owns task state
│   ├── TaskPanel.tsx            # one day's list plus its title/description composer
│   └── TaskItem.tsx             # a task: checkbox, description, inline editor
├── lib/
│   ├── supabase.ts              # the shared Supabase client + Database types
│   ├── habits.ts                # fetch/create/rename/delete habits
│   ├── habitLogs.ts             # fetchMonthCompletions(), setHabitCompletion()
│   ├── dailyTasks.ts            # fetch/create/update/delete daily tasks
│   ├── migrateLocalStorage.ts   # one-time Phase 1 → Supabase migration
│   └── dates.ts                 # month maths, calendar days, formatting, useToday()
└── types/
    └── habit.ts                 # Habit, HabitLog, DailyTask, Month, CalendarDay, …

scripts/
└── check-supabase.mjs           # `npm run check:db` connectivity/schema check

supabase/
├── schema.sql                   # tables, constraints, RLS policies, seed habits
└── migrations/
    └── 0001_phase3_tasks_and_habit_writes.sql   # Phase 2 → Phase 3 delta
```

## Features

- Today's full date — `Friday, 21 August 2026` — headlining the page
- Monthly grid of habit rows × day columns, loaded from PostgreSQL
- Habits added, renamed and deleted from the grid itself, with a confirmation before
  a delete takes its history with it
- A daily tasks section below the grid: tomorrow's plan becomes today's checklist,
  each task with its own description box, editable and deletable
- Day columns generated from the month, so 28/29/30/31-day months and leap years
  all work
- Previous / next month navigation with a "Today" shortcut, fetching only that month
- Click a cell to toggle complete / incomplete, saved as a single upsert
- Optimistic updates with rollback and an error message when a save fails
- Loading state while habits and logs are fetched, and a retry on load failure
- The current day's column is highlighted
- Responsive: the full month fits a desktop screen; on narrow screens the calendar
  scrolls horizontally while the habit-name column stays pinned
- Keyboard accessible cells (`role="checkbox"` with `aria-checked` and full labels)

## Future phases

Deliberately out of scope for now: authentication and accounts, drag-to-reorder
habits, task lists for arbitrary dates beyond today and tomorrow, statistics and
streaks, charts, goals and journaling, reminders, offline sync and PWA support.
