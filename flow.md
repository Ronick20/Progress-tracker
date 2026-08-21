# Progress Tracker — Complete Project Flow

A single document explaining **what this project is, what was built, what
technology it uses, how the data flows, and why each decision was made.**

Read it top to bottom once and you should be able to open any file in the repo
and know exactly where it sits in the picture.

---

## 1. What the app is

A personal **habit tracker + daily task planner**, in one page.

Three things live on that page:

1. **Overall Progress** — an all-time analysis of every habit, drawn as bar
   charts, ending in one named habit: *"improve this one next"*.
2. **The month grid** — habits down the left, every day of the month across the
   top, a clickable cell at each intersection. Click = done.
3. **Today / Tomorrow task panels** — free-text tasks attached to a date. You
   write tomorrow's plan tonight, and tick it off tomorrow.

Everything is saved to a cloud database (Supabase), so the same data appears on
every device you open the app on. There is **no login** — it is a single-user
personal tool (see §9 for what that means for security).

---

## 2. The stack — what was used and why

| Layer | Choice | Version | Why |
|---|---|---|---|
| Framework | **Next.js (App Router)** | 16.3.1 | React framework; gives routing, bundling, dev server, build. Only one route here (`/`). |
| UI library | **React** | 19.2.8 | Component model + hooks. |
| Language | **TypeScript** | ^5, `strict: true` | Every row shape, date key and habit id is typed. |
| Styling | **Tailwind CSS v4** | ^4 | Utility classes in JSX. v4 configures itself *in CSS* (`@theme` in `globals.css`), not in a `tailwind.config.js`. |
| Database | **Supabase (PostgreSQL)** | client `@supabase/supabase-js` ^2.112 | Hosted Postgres + an auto-generated REST API (PostgREST) callable straight from the browser. |
| Linting | **ESLint** + `eslint-config-next` | ^9 | `npm run lint`. |
| Diagnostics | plain Node script | — | `npm run check:db`, no dependencies. |

**Deliberately *not* used:** no state library (Redux/Zustand), no data-fetching
library (React Query/SWR), no ORM (Prisma/Drizzle), no auth, no API routes, no
server components doing data work, no chart library.

Why: the whole app is one screen with three data sets. Plain `useState` +
`useEffect` + the Supabase client is enough, and the charts are `<div>`s with
percentage widths — a charting library would be more code than the chart.

### Notable architectural fact: **there is no backend of your own**

There are **no Next.js API routes and no server actions**. The browser talks to
Supabase's REST API *directly*, using the public `anon` key. Next.js is only
serving the HTML/JS. The database's own **Row Level Security (RLS)** rules are
what decide who may do what — that is the entire authorization layer.

```
Browser (React) ──HTTPS──> Supabase PostgREST ──> PostgreSQL
                            (RLS policies enforced here)
```

---

## 3. Repository map

```
Progress_Tracker/
├── src/
│   ├── app/                         ← Next.js App Router
│   │   ├── layout.tsx               root <html>/<body>, metadata, imports globals.css
│   │   ├── page.tsx                 the one route "/" — renders <HabitTracker/>
│   │   └── globals.css              Tailwind v4 import + @theme colour tokens
│   │
│   ├── components/                  ← all UI ("use client" — everything is interactive)
│   │   ├── HabitTracker.tsx         ★ the orchestrator: owns habits + month state
│   │   ├── ProgressAnalytics.tsx    the all-time analysis panel + bar charts
│   │   ├── MonthSelector.tsx        ‹ August 2026 › + "Today"
│   │   ├── CalendarHeader.tsx       the day-number / weekday column headers
│   │   ├── HabitRow.tsx             one habit row: name (rename/delete) + its cells
│   │   ├── HabitCell.tsx            one clickable tick box
│   │   ├── AddHabitForm.tsx         "Add a habit…" at the bottom of the grid
│   │   ├── DailyTasks.tsx           owns task state for today + tomorrow
│   │   ├── TaskPanel.tsx            one day's task list + its add-task form
│   │   └── TaskItem.tsx             one task: tick, inline edit, delete
│   │
│   ├── lib/                         ← all logic and all database access
│   │   ├── supabase.ts              ★ client singleton, DB types, error translation
│   │   ├── habits.ts                CRUD for `habits`
│   │   ├── habitLogs.ts             read a month / upsert one tick
│   │   ├── dailyTasks.ts            CRUD for `daily_tasks`
│   │   ├── analytics.ts             ★ the scoring algorithm + all-time log fetch
│   │   ├── dates.ts                 ★ every date rule lives here (incl. rest days)
│   │   └── migrateLocalStorage.ts   one-time Phase 1 → Supabase import
│   │
│   └── types/habit.ts               the shared domain types
│
├── supabase/
│   ├── schema.sql                   full schema, run once on a fresh project
│   └── migrations/0001_phase3_…sql  the Phase 2→3 delta (tasks + habit writes)
│
├── scripts/check-supabase.mjs       `npm run check:db` connectivity/schema probe
├── .env.local                       your real credentials (git-ignored)
├── .env.example                     template
└── AGENTS.md / CLAUDE.md            agent instructions (Next.js version warning)
```

★ = the four files that carry most of the project's thinking.

---

## 4. The data model

Three tables, all in the Postgres `public` schema. Defined in
[supabase/schema.sql](supabase/schema.sql), mirrored as TypeScript in the
`Database` interface in [src/lib/supabase.ts](src/lib/supabase.ts).

### `habits` — one row per habit
| column | type | note |
|---|---|---|
| `id` | uuid PK | generated by Postgres |
| `name` | text | max 60 chars enforced in the app |
| `icon` | text null | reserved, unused today |
| `active` | bool | `false` hides a habit without losing history |
| `sort_order` | int | row order in the grid |
| `created_at` | timestamptz | **also the start of that habit's scoring window** |

### `habit_logs` — one row per (habit, day)
| column | type | note |
|---|---|---|
| `id` | uuid PK | |
| `habit_id` | uuid FK → habits | **`on delete cascade`** |
| `date` | date | local `YYYY-MM-DD` |
| `completed` | bool | unticking writes `false`, it does **not** delete |
| `created_at` / `updated_at` | timestamptz | `updated_at` maintained by trigger |

**`unique (habit_id, date)`** — the keystone constraint. Because at most one row
can exist per habit per day, every write is a single **upsert** with
`onConflict: "habit_id,date"`. Insert-vs-update never has to be decided in the
app, and a double-click can never produce two conflicting rows.

Index: `habit_logs_date_idx on (date)` — serves the "one month at a time" range
query.

### `daily_tasks` — one row per task, attached to a date (not a habit)
| column | type |
|---|---|
| `id` uuid PK, `date` date, `title` text, `description` text null, `completed` bool, `sort_order` int, timestamps |

Index on `(date)` — only ever one or two specific days are read.

### Triggers
`public.set_updated_at()` is a `plpgsql` trigger fired `before update` on
`habit_logs` and `daily_tasks`, so `updated_at` cannot be forgotten or faked by
the client.

### Seed data
`schema.sql` ends with a conditional insert of 12 starter habits
(`Wake up at 05:00`, `Gym`, … `Plan Tomorrow`) guarded by
`where not exists (… same name …)`, so re-running never duplicates.
⚠️ Re-running the *whole* `schema.sql` will resurrect habits you deleted in the
app — that is exactly why the separate migration file exists.

---

## 5. Startup / boot flow

```
1. Browser requests "/"
2. Next.js renders layout.tsx → page.tsx → <HabitTracker/>   (server render)
      · today is null on the server (useToday returns null),
        so the date heading renders as a blank space (&nbsp;)
      · this is on purpose: server HTML and first client HTML must match,
        otherwise React hydration errors
3. Hydration on the client → useToday() now returns a real Date (cached, so
   every render sees the same instance and it is safe as a memo dependency)
4. viewedMonth becomes the current month → the loading effect fires
```

### The loading effect (`HabitTracker.tsx`, `useEffect` on `[viewedMonth, monthKey, retryCount]`)

```
if habitsRef is empty:
    a) fetchHabits()                    → GET habits where active=true, ordered
    b) migrateLegacyCompletions(habits) → one-time localStorage upload
    c) store in habitsRef AND setHabits()
fetchMonthCompletions(viewedMonth)      → GET habit_logs for that month only
setMonthData({ monthKey, completions })
```

Three details worth understanding:

- **`habitsRef`** — habits are held in a ref *as well as* state so the effect can
  read them without listing `habits` as a dependency (which would refetch in an
  infinite loop). It is also updated on every add/rename/delete, so an
  in-flight month change never overwrites a local edit.
- **`let active = true` + cleanup `active = false`** — the standard stale-response
  guard. Flip to March quickly and February's late response is discarded instead
  of being painted over March.
- **`monthKey` tagging instead of an `isLoading` flag.** Loaded data and load
  errors are both stamped with the month they belong to, and readiness is
  *derived*: `isReady = monthData?.monthKey === monthKey`. Changing month
  automatically makes the view "not ready" with no flag to remember to flip.

Cost: **2 requests on first load, 1 per month change** — never one per cell.

In parallel, two other components load their own data:
- `<ProgressAnalytics>` → `fetchAllCompletedLogs()` (all-time, `completed=true` only)
- `<DailyTasks>` → `fetchTasksForDates([todayKey, tomorrowKey])` (one request for both days)

---

## 6. The interaction flows

### 6a. Ticking a habit cell — *optimistic write with rollback*

```
HabitCell click
  → HabitRow: onToggle(habit.id, day.key)
    → HabitTracker.toggleCompletion:
         completed = !completions[date]?.[habitId]       (invert current)
         setMonthData(applyCompletion(...))              ← UI flips INSTANTLY
         then, async:
             setHabitCompletion(habitId, date, completed)
                 → upsert into habit_logs on (habit_id, date)
             ✔ success → setAnalysisVersion(v+1)  ← makes the chart re-read history
             ✘ failure → applyCompletion(..., !completed)  ← ROLL BACK
                         setSaveError(describeSupabaseError(...))
```

The invariant: **the grid never shows a tick the database does not have.** The
analysis version is bumped *only on success*, because a rolled-back toggle left
stored data unchanged and the chart on screen is therefore still correct.

`applyCompletion` is a pure helper that returns a new `CompletionMap`, deleting
the date's entry entirely when its last habit is unticked (keeps the map free of
empty objects).

### 6b. Adding a habit — *awaited, not optimistic*

`AddHabitForm` submit → `HabitTracker.addHabit(name)`:
- `sortOrder` = highest existing + 1 (computed on the client — the screen already
  knows the last position, so no extra read)
- `await createHabit(...)` → `.insert().select().single()` returns the row **with
  its Postgres-generated UUID**
- only then is it appended to the list

It is awaited (not optimistic) precisely because the row is worthless without its
real `id` — the cells beneath it key their writes on it. The input field is only
cleared after the write resolves, so a failed save doesn't lose what you typed.

### 6c. Renaming — *optimistic*
`HabitRow` holds a local `draftName`. Commit on Enter or blur; Escape cancels.
Empty or unchanged names simply close the editor (blanking the field can never
wipe a habit's label). The rename is applied to state immediately and the
previous array is restored if the write fails. Logs are keyed by `id`, so
**renaming never touches history**.

### 6d. Deleting a habit — *confirmed, optimistic, reversible on failure*
`window.confirm` first, because `on delete cascade` means deleting a habit
deletes **every tick it ever had**. The row is removed from the list immediately
and put back if the DELETE fails.

### 6e. Tasks (`DailyTasks.tsx`)
Same three patterns, one level down:
- **add** → awaited (needs the real id), sort order = max+1 *within that date*
- **toggle / edit** → both funnel through one `applyChange(task, changes)` helper,
  optimistic, and on failure restore the *entire original task object*
- **delete** → confirm, remove, re-append on failure

`showCheckboxes` is `true` for today and `false` for tomorrow: a day you are
still planning cannot be ticked off yet — tomorrow's panel shows bullets instead.

### 6f. Month navigation
`pinnedMonth` is `null` by default meaning *"follow the real current month"*.
Pressing ‹ or › pins an explicit month; "Today" sets it back to `null`.
`viewedMonth = pinnedMonth ?? getMonthOf(today)`. Changing it changes `monthKey`,
which un-readies the view and re-runs the loading effect.

---

## 7. The date rules (`src/lib/dates.ts`)

Every calendar decision is centralised here. The two ideas that matter:

**1. Local `YYYY-MM-DD` keys, never `toISOString()`.**
`toDateKey()` builds the key from `getFullYear/getMonth/getDate`. Using
`toISOString()` would convert to UTC and, east or west of Greenwich, could file a
tick under the wrong day. Keys also sort lexicographically by date, which
`minDateKey` exploits.

**2. Sunday is a rest day — removed from the window, not counted as missed.**
```ts
const REST_WEEKDAY = 0;  // Sunday. Saturday IS a working day here.
```
This single rule propagates everywhere:
- the grid greys Sunday's header
- `countActiveDays(start, end)` — the denominator — computes total days, finds
  the first Sunday's offset, and subtracts one per week
- streaks skip Sundays: `nextActiveDay` / `previousActiveDay` mean a Saturday
  followed by a Monday is an **unbroken** streak
- ticks that land on a Sunday are dropped from the numerator too, so a habit
  cannot exceed 100%

**`daysBetween`** converts both keys to `Date.UTC(...)` before subtracting, so a
daylight-saving change inside the range cannot shift the count by a day.

**`useToday()`** uses `useSyncExternalStore` with a server snapshot of `null` and
a cached client `Date`. The clock is read once on mount and never pushes updates
— that is what keeps the value stable as a memo dependency.

---

## 8. The analysis algorithm (`src/lib/analytics.ts`)

This is the most opinionated part of the project. It answers *"how am I doing
overall, and what one thing should I fix?"*

### Per habit (`scoreHabit`)

```
startDate    = min(habit.createdAt, earliest ever tick)   ← its OWN window
calendarDays = daysBetween(startDate, today) + 1          ← wording only
trackedDays  = countActiveDays(startDate, today)          ← the denominator (no Sundays)
doneDays     = ticks inside the window, Sundays excluded
missedDays   = trackedDays − doneDays
rate         = doneDays / trackedDays
```

Judging each habit against **its own window** is why a habit added last week
isn't punished for the months before it existed. Within that window a day is
either done or missed — there is no third state, which is what makes
"achievement" and "procrastination" two halves of a single bar.

```
recentWindowDays = min(30, calendarDays)
recentRate       = same calculation over just those last 30 days
trend            = recentRate − rate       (positive = improving)
currentStreak    = consecutive expected days back from today
                   (today is skipped if not yet ticked — the day isn't over)
longestStreak    = longest run of consecutive expected days ever
daysSinceLastDone
hasEnoughHistory = trackedDays >= 7        (MIN_DAYS_FOR_VERDICT)
```

### The focus pick

```ts
needsWorkScore = 0.6 * (1 − rate) + 0.4 * (1 − recentRate)
```

Deliberately **not** just "lowest percentage". A habit that was poor for months
but has been solid lately is already being fixed; one that used to be fine and
has now been dropped is the more useful thing to be told about. Weighted 60/40
toward all-time because the question asked is about *overall* progress.

Tie-breaks (`isWorseThan`): higher score → then the habit left alone longest →
then more missed days.

Guards:
- only habits with ≥7 tracked days are eligible — but if *none* qualifies, the
  whole list is used and the card says **"Early call — only N days of history"**
- `focus` is `null` if the worst habit has **zero** missed days (nothing to flag)

### Rendering (`ProgressAnalytics.tsx`)
- Habits sorted **worst first** — the chart's job is to put the problem at the top
- One split bar per habit: green `--color-accent` = done, red `--color-miss` =
  missed. Every bar spans the **full width**, because habits have different
  denominators — what's comparable between them is *where the split falls*, not
  how long the bar is
- Split into two side-by-side plots above `lg`, padded to equal height so both
  axes sit on one line
- Gridlines at 0/25/50/75/100 plus a **black average line**, drawn *on top* of
  the bars (bars are full-width, so lines behind them would be invisible)
- Accessibility: each bar carries a full sentence in `aria-label`/`title` with
  the raw counts, and `--color-miss` was picked to stay separable from the green
  under deuteranopia (OKLab ΔE 12.4), with a percentage printed on every bar

Refresh: the `refreshKey` prop (= `analysisVersion`) changes on every successful
tick, re-running the fetch. Refetching is cheaper than mirroring every optimistic
edit into a second copy of the data, because ticking is rare compared to
rendering.

---

## 9. Configuration, security and error handling

### Environment
```
NEXT_PUBLIC_SUPABASE_URL       e.g. https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY  the anon / publishable key
```
Read in [src/lib/supabase.ts](src/lib/supabase.ts) as **full literal
expressions** — Next.js inlines `NEXT_PUBLIC_*` at build time by substituting
the exact text, so destructuring `process.env` would break it.

The client is **lazily created on first use**, not at import time, so a build
without credentials still succeeds; the missing config surfaces as a UI error
instead of a build failure. `auth: { persistSession: false, autoRefreshToken:
false }` — there are no sessions to persist.

### The security model — read this
- The **anon key ships to the browser by design**, and that is safe *only
  because* RLS is enabled on all three tables.
- RLS denies everything by default; the policies then grant exactly what the app
  does: full CRUD on `habits` and `daily_tasks`, and select/insert/update on
  `habit_logs` (never delete — unticking writes `false`, and removing a habit
  takes its logs via cascade).
- **Limitation, stated plainly in the SQL:** with no authentication, anyone
  holding the URL + anon key can read and write this data. Acceptable for a
  single-user personal tracker; **it is not multi-tenant.** Per-user isolation
  needs auth, at which point every `using (true)` must become an owner check.
- The **service role key bypasses RLS and must never appear in client code or
  `.env.local`.**

> ⚠️ **Currently uncommitted:** `.env.example` has been edited to contain a real
> project URL and publishable key instead of placeholders. `.env.example` *is*
> committed to git (only `.env.local` is ignored), so committing that change
> publishes those values. Worth reverting to placeholders.

### Error handling (`describeSupabaseError`)
Failures are sorted into three kinds so the message can be actionable:

| kind | detected by | message |
|---|---|---|
| Not configured | `SupabaseConfigError` | "Set NEXT_PUBLIC_… in .env.local and restart the dev server." |
| Schema behind | codes `42501` (RLS denied), `42P01` (no such table), `PGRST205` (not in schema cache), `PGRST204` (no such column) | `SETUP_REQUIRED_MESSAGE` → "run `supabase/migrations/0001_…sql`" |
| Anything else | — | the caller's generic "check your connection and try again" |

The point: **neither of the first two can be healed by retrying**, so they must
never be reported as a connection problem. Load failures render a Retry button
(which bumps `retryCount` and re-runs the effect); save failures render a
`role="alert"` banner after the change has already been rolled back.

### `npm run check:db`
A dependency-free Node script (`node --env-file=.env.local`) that answers what
the in-app error cannot: is it the network, the credentials, or an unapplied
migration? It reads each table **and actually performs a write** — inserting a
probe habit (`active: false`, so it stays out of the grid even if the cleanup
delete is itself refused) and deleting it again. No read can tell you whether a
write policy exists; only a write can.

---

## 10. How the project was built — the phases

Reconstructed from git history and the code's own comments:

- **Phase 0** — `create-next-app` scaffold; placeholder assets removed.
- **Phase 1** — the grid, entirely client-side, persisted to **localStorage**
  under `habit-tracker.completions.v1`, with habits identified by hand-written
  slugs (`wake-up-05`, `gym`, …). Month navigation and grid sizing tuned here.
- **Phase 2** — Supabase introduced. `habits` + `habit_logs` created; habits
  were **read-only** from the app (seeded by SQL). Data moved to the cloud.
  `migrateLocalStorage.ts` bridges Phase 1 → 2 by mapping the old slugs to
  habit *names* (the only thing old and new records share), then to UUIDs.
- **Phase 3** — habits become editable in-app, and `daily_tasks` is added.
  This is where the bug fixed in commit `ba2d6a0` lived: the Phase 2 policies
  granted `select` only, so adding a habit failed with *"new row violates
  row-level security policy for table habits"*. Migration `0001` ships the
  delta (new table + the missing insert/update/delete policies).
  `check:db` added to diagnose exactly that class of failure.
- **Latest** (`91b8ff8`) — the Overall Progress charts and the focus pick.

### The localStorage migration, precisely
Runs once, guarded by `habit-tracker.migrated-to-supabase.v1`. Even if the guard
were lost, every write is an upsert on `(habit_id, date)`, so re-running cannot
duplicate. The legacy entry is **left in place, never deleted**, so a partial
upload destroys nothing. Habits that no longer exist are skipped rather than
failing the whole batch on a foreign key error. If storage is unavailable
(private browsing) the flag reads as "already migrated" — there's no legacy data
to read in that case either.

---

## 11. Cross-cutting patterns to recognise

Once you see these five, the whole codebase reads quickly:

1. **Optimistic UI + explicit rollback.** Every mutation except *create* updates
   state first, writes second, and restores the exact previous value on failure.
   Creates are awaited because they need the server-generated UUID.
2. **`let active = true` in every data effect.** Late responses are discarded, not
   rendered.
3. **Derived readiness, not loading flags.** Data is tagged with what it is
   (`monthKey`), and "ready" is computed by comparison.
4. **All database access lives in `src/lib/*`, never in a component.** Components
   call `fetchX`/`createX`; they never touch the Supabase client.
5. **`snake_case` at the database boundary, `camelCase` everywhere above it.**
   Each lib file has a private `toHabit` / `toTask` mapper; the conversion happens
   exactly once, at the edge.

---

## 12. Running it

```bash
npm install

# 1. credentials
cp .env.example .env.local        # then fill in from Supabase → Settings → API

# 2. database — in the Supabase SQL editor:
#    fresh project → run supabase/schema.sql
#    existing Phase 2 db → run supabase/migrations/0001_phase3_tasks_and_habit_writes.sql
#    (use the migration, not schema.sql, if you have deleted seeded habits —
#     schema.sql's seed insert would bring them back)

# 3. verify
npm run check:db

# 4. go
npm run dev        # http://localhost:3000
npm run build      # production build
npm run lint
```

`AGENTS.md` (re-generated by `next dev`) warns that this is Next.js 16, whose
APIs differ from older versions — check `node_modules/next/dist/docs/` before
writing framework code.

---

## 13. Known limits / where it goes next

- **No authentication** → not multi-tenant; the anon key grants full access to
  whoever has it.
- **`habit_logs` only grows.** Unticking writes `completed = false` rather than
  deleting, so the table accumulates a row per habit per interacted day.
- **The analysis fetches all completed logs on every refresh** — two columns per
  row keeps it small, but it is unbounded over years.
- **`habits.icon` exists but is never rendered** — reserved for a later phase.
- **`sort_order` cannot be changed in-app** — new habits always go last; there is
  no drag-to-reorder.
- **Sunday-as-rest-day is hard-coded** (`REST_WEEKDAY = 0`), not configurable.
- **No tests.**
