# Habit Tracker

A monthly habit tracker: your habits are rows, every day of the selected month is a
column, and clicking a cell marks that habit complete for that day. Everything is
stored in your browser — no account, no server, no setup.

## Tech stack

- Next.js 16 (App Router)
- React 19
- TypeScript
- Tailwind CSS v4
- `localStorage` for persistence

No other runtime dependencies.

## Installation

```bash
npm install
```

## Development commands

```bash
npm run dev     # start the dev server on http://localhost:3000
npm run build   # production build
npm run start   # serve the production build
npm run lint    # ESLint
npx tsc --noEmit  # type check
```

## Project structure

```text
src/
├── app/
│   ├── layout.tsx          # root layout and metadata
│   ├── page.tsx            # renders the tracker
│   └── globals.css         # Tailwind import, theme tokens, scrollbar styling
├── components/
│   ├── HabitTracker.tsx    # state, month navigation, grid assembly
│   ├── MonthSelector.tsx   # ← August 2026 → plus a "Today" shortcut
│   ├── CalendarHeader.tsx  # day-number / weekday column headers
│   ├── HabitRow.tsx        # one habit: sticky name cell + its day cells
│   └── HabitCell.tsx       # a single toggleable completion cell
├── lib/
│   ├── dates.ts            # month maths, calendar days, formatting, useToday()
│   ├── habits.ts           # the default habit list
│   └── storage.ts          # localStorage-backed store + useCompletions()
└── types/
    └── habit.ts            # Habit, Month, CalendarDay, CompletionMap, …
```

### Changing the habits

Edit `DEFAULT_HABITS` in [`src/lib/habits.ts`](src/lib/habits.ts). Each habit has a
stable `id` (what gets persisted) and a `name` (what gets displayed), so a habit can
be renamed without losing its history.

### Stored data

One key, `habit-tracker.completions.v1`, holding only the completed entries:

```json
{
  "version": 1,
  "completions": {
    "2026-08-21": { "gym": true, "cold-shower": true }
  }
}
```

## Phase 1 features

- Monthly grid of habit rows × day columns
- 12 default habits, easy to edit in one place
- Day columns generated from the month, so 28/29/30/31-day months and leap years
  all work
- Previous / next month navigation with a "Today" shortcut
- Click a cell to toggle complete / incomplete
- The current day's column is highlighted
- `localStorage` persistence, including sync between open tabs
- Responsive: the full month fits a desktop screen; on narrow screens the calendar
  scrolls horizontally while the habit-name column stays pinned
- Keyboard accessible cells (`role="checkbox"` with `aria-checked` and full labels)

## Future phases

Deliberately out of scope for now: statistics and streaks, charts, goals and
journaling, reminders, cloud sync and accounts, and any backend. They are planned
for later phases.
