"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AddHabitForm } from "@/components/AddHabitForm";
import { CalendarHeader } from "@/components/CalendarHeader";
import { DailyTasks } from "@/components/DailyTasks";
import { HabitRow } from "@/components/HabitRow";
import { MonthSelector } from "@/components/MonthSelector";
import {
  addMonths,
  formatFullDate,
  getCalendarDays,
  getMonthOf,
  isSameMonth,
  useToday,
} from "@/lib/dates";
import { createHabit, deleteHabit, fetchHabits, renameHabit } from "@/lib/habits";
import { fetchMonthCompletions, setHabitCompletion } from "@/lib/habitLogs";
import { migrateLegacyCompletions } from "@/lib/migrateLocalStorage";
import { SupabaseConfigError } from "@/lib/supabase";
import type {
  CompletionMap,
  DateKey,
  Habit,
  HabitId,
  Month,
} from "@/types/habit";

const EMPTY_DATE_SET: ReadonlySet<DateKey> = new Set();
const EMPTY_COMPLETIONS: CompletionMap = {};

const LOAD_ERROR_MESSAGE =
  "Unable to load your tracker. Check your connection and try again.";
const SAVE_ERROR_MESSAGE = "Unable to save your change. Please try again.";
const HABIT_SAVE_ERROR_MESSAGE = "Unable to save your habit change. Please try again.";

/** A month's loaded completions, tagged with the month they belong to. */
interface MonthData {
  monthKey: string;
  completions: CompletionMap;
}

interface LoadFailure {
  monthKey: string;
  message: string;
}

export function HabitTracker() {
  const today = useToday();

  /** `null` means "follow the current month"; navigation pins a month here. */
  const [pinnedMonth, setPinnedMonth] = useState<Month | null>(null);

  const [habits, setHabits] = useState<Habit[]>([]);
  const [monthData, setMonthData] = useState<MonthData | null>(null);
  const [loadFailure, setLoadFailure] = useState<LoadFailure | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  /** Bumped by the retry button to re-run the loading effect. */
  const [retryCount, setRetryCount] = useState(0);

  const viewedMonth = useMemo(
    () => pinnedMonth ?? (today ? getMonthOf(today) : null),
    [pinnedMonth, today],
  );

  /**
   * Identifies the month on screen. Loaded data and load errors are both tagged
   * with it, so "is this month ready?" is derived from state rather than needing
   * a loading flag to be flipped every time the month changes.
   */
  const monthKey = viewedMonth ? `${viewedMonth.year}-${viewedMonth.month}` : null;

  const days = useMemo(
    () => (viewedMonth && today ? getCalendarDays(viewedMonth, today) : []),
    [viewedMonth, today],
  );

  /**
   * Habits are fetched once and reused across months; only the visible month's
   * logs are re-fetched when the month changes. That is two requests on first
   * load and one per month change — never one per cell.
   *
   * `habitsRef` holds the habits already loaded so the effect can see them
   * without listing them as a dependency and refetching in a loop.
   */
  const habitsRef = useRef<Habit[]>([]);

  useEffect(() => {
    if (!viewedMonth || !monthKey) return;

    // Guards against a response that arrives after the user has moved to
    // another month: the stale result is discarded instead of being shown.
    let active = true;

    void (async () => {
      try {
        let loadedHabits = habitsRef.current;

        if (loadedHabits.length === 0) {
          loadedHabits = await fetchHabits();
          if (!active) return;

          // One-time upload of any Phase 1 localStorage data. Runs before the
          // first month is read so migrated ticks appear straight away.
          await migrateLegacyCompletions(loadedHabits);
          if (!active) return;

          habitsRef.current = loadedHabits;
          setHabits(loadedHabits);
        }

        const completions = await fetchMonthCompletions(viewedMonth);
        if (!active) return;

        setMonthData({ monthKey, completions });
      } catch (error) {
        if (!active) return;

        console.error("[habit-tracker] failed to load data", error);
        setLoadFailure({
          monthKey,
          message:
            error instanceof SupabaseConfigError ? error.message : LOAD_ERROR_MESSAGE,
        });
      }
    })();

    return () => {
      active = false;
    };
  }, [viewedMonth, monthKey, retryCount]);

  const isReady = monthKey !== null && monthData?.monthKey === monthKey;
  const failure = loadFailure?.monthKey === monthKey ? loadFailure : null;
  const completions = isReady ? monthData.completions : EMPTY_COMPLETIONS;

  /** Completed dates per habit, limited to the visible month. */
  const completedDatesByHabit = useMemo(() => {
    const byHabit = new Map<HabitId, Set<DateKey>>();

    for (const day of days) {
      const completedHabits = completions[day.key];
      if (!completedHabits) continue;

      for (const habitId of Object.keys(completedHabits)) {
        const dates = byHabit.get(habitId) ?? new Set<DateKey>();
        dates.add(day.key);
        byHabit.set(habitId, dates);
      }
    }

    return byHabit;
  }, [days, completions]);

  /**
   * Toggling is optimistic: the cell flips immediately, then that one
   * habit/date row is upserted. If the write fails the change is rolled back,
   * so the grid never shows a tick the database does not have.
   */
  const toggleCompletion = useCallback(
    (habitId: HabitId, dateKey: DateKey) => {
      if (!monthKey) return;

      const completed = !completions[dateKey]?.[habitId];

      setMonthData((previous) =>
        previous && previous.monthKey === monthKey
          ? {
              monthKey,
              completions: applyCompletion(
                previous.completions,
                habitId,
                dateKey,
                completed,
              ),
            }
          : previous,
      );
      setSaveError(null);

      void (async () => {
        try {
          await setHabitCompletion(habitId, dateKey, completed);
        } catch (error) {
          console.error("[habit-tracker] failed to save completion", error);

          setMonthData((previous) =>
            previous && previous.monthKey === monthKey
              ? {
                  monthKey,
                  completions: applyCompletion(
                    previous.completions,
                    habitId,
                    dateKey,
                    !completed,
                  ),
                }
              : previous,
          );
          setSaveError(SAVE_ERROR_MESSAGE);
        }
      })();
    },
    [completions, monthKey],
  );

  /**
   * Habits are edited straight from the grid. `habitsRef` is updated alongside
   * the rendered list so the loading effect never re-fetches over a change that
   * has not yet been read back from the database.
   */
  const applyHabits = useCallback((next: Habit[]) => {
    habitsRef.current = next;
    setHabits(next);
  }, []);

  /** Adding awaits the write, so the new row appears with its database id. */
  const addHabit = useCallback(
    async (name: string) => {
      const sortOrder =
        habits.reduce((highest, habit) => Math.max(highest, habit.sortOrder), 0) + 1;

      try {
        const created = await createHabit(name, sortOrder);
        applyHabits([...habits, created]);
        setSaveError(null);
      } catch (error) {
        console.error("[habit-tracker] failed to add habit", error);
        setSaveError(HABIT_SAVE_ERROR_MESSAGE);
      }
    },
    [habits, applyHabits],
  );

  /** Renaming is optimistic; a failed write puts the old name back. */
  const renameHabitById = useCallback(
    (habitId: HabitId, name: string) => {
      const previous = habits;

      applyHabits(habits.map((habit) => (habit.id === habitId ? { ...habit, name } : habit)));
      setSaveError(null);

      void (async () => {
        try {
          await renameHabit(habitId, name);
        } catch (error) {
          console.error("[habit-tracker] failed to rename habit", error);
          applyHabits(previous);
          setSaveError(HABIT_SAVE_ERROR_MESSAGE);
        }
      })();
    },
    [habits, applyHabits],
  );

  /**
   * Deleting a habit also deletes every tick it ever had, through the database
   * cascade, so it is confirmed first and the row is restored if the write fails.
   */
  const removeHabit = useCallback(
    (habit: Habit) => {
      const message =
        `Delete “${habit.name}”?\n\n` +
        "This also deletes everything you have ticked off for it. This cannot be undone.";
      if (!window.confirm(message)) return;

      const previous = habits;

      applyHabits(habits.filter((item) => item.id !== habit.id));
      setSaveError(null);

      void (async () => {
        try {
          await deleteHabit(habit.id);
        } catch (error) {
          console.error("[habit-tracker] failed to delete habit", error);
          applyHabits(previous);
          setSaveError(HABIT_SAVE_ERROR_MESSAGE);
        }
      })();
    },
    [habits, applyHabits],
  );

  const retry = useCallback(() => {
    setLoadFailure(null);
    setRetryCount((count) => count + 1);
  }, []);

  const goToPreviousMonth = useCallback(() => {
    if (viewedMonth) setPinnedMonth(addMonths(viewedMonth, -1));
  }, [viewedMonth]);

  const goToNextMonth = useCallback(() => {
    if (viewedMonth) setPinnedMonth(addMonths(viewedMonth, 1));
  }, [viewedMonth]);

  const goToCurrentMonth = useCallback(() => setPinnedMonth(null), []);

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-ink-faint">
            Habit Tracker
          </p>
          {/* Rendered only once the client clock is known, so the server and the
              first client render agree. */}
          <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            {today ? formatFullDate(today) : "\u00a0"}
          </h1>
        </div>

        {today && viewedMonth ? (
          <MonthSelector
            month={viewedMonth}
            isCurrentMonth={isSameMonth(viewedMonth, getMonthOf(today))}
            onPreviousMonth={goToPreviousMonth}
            onNextMonth={goToNextMonth}
            onCurrentMonth={goToCurrentMonth}
          />
        ) : null}
      </header>

      {saveError ? (
        <p
          role="alert"
          className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {saveError}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-line bg-panel">
        {isReady ? (
          <div className="calendar-scroll overflow-x-auto">
            <div
              role="grid"
              aria-label={`Habit completion grid for the selected month, ${days.length} days`}
              className="grid min-w-max [--day-col:2.25rem] [--habit-col:10.5rem] sm:[--day-col:2.375rem] sm:[--habit-col:13rem]"
              style={{
                gridTemplateColumns: `var(--habit-col) repeat(${days.length}, var(--day-col))`,
              }}
            >
              <CalendarHeader days={days} />

              {habits.map((habit) => (
                <HabitRow
                  key={habit.id}
                  habit={habit}
                  days={days}
                  completedDates={completedDatesByHabit.get(habit.id) ?? EMPTY_DATE_SET}
                  onToggle={toggleCompletion}
                  onRename={renameHabitById}
                  onDelete={removeHabit}
                />
              ))}
            </div>
          </div>
        ) : failure ? (
          <div className="flex h-[27rem] flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="max-w-sm text-sm text-ink-muted">{failure.message}</p>
            <button
              type="button"
              onClick={retry}
              className="rounded-md border border-line bg-panel-raised px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-line-strong hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="flex h-[27rem] items-center justify-center text-sm text-ink-faint">
            Loading your habits…
          </div>
        )}

        {isReady ? <AddHabitForm onAdd={addHabit} /> : null}
      </div>

      <p className="text-xs text-ink-faint">
        Click a cell to mark a habit complete. Hover a habit to rename or delete it.
        Everything is saved to the cloud, so it is there on every device you use.
      </p>

      {today ? <DailyTasks today={today} /> : null}
    </section>
  );
}

/** Returns a new map with one habit/date entry set or cleared. */
function applyCompletion(
  completions: CompletionMap,
  habitId: HabitId,
  dateKey: DateKey,
  completed: boolean,
): CompletionMap {
  const next = { ...completions };
  const completedOnDate = { ...next[dateKey] };

  if (completed) {
    completedOnDate[habitId] = true;
  } else {
    delete completedOnDate[habitId];
  }

  if (Object.keys(completedOnDate).length === 0) {
    delete next[dateKey];
  } else {
    next[dateKey] = completedOnDate;
  }

  return next;
}
