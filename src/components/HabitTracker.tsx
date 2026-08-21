"use client";

import { useCallback, useMemo, useState } from "react";

import { CalendarHeader } from "@/components/CalendarHeader";
import { HabitRow } from "@/components/HabitRow";
import { MonthSelector } from "@/components/MonthSelector";
import {
  addMonths,
  getCalendarDays,
  getMonthOf,
  isSameMonth,
  useToday,
} from "@/lib/dates";
import { DEFAULT_HABITS } from "@/lib/habits";
import { updateCompletions, useCompletions } from "@/lib/storage";
import type { DateKey, Habit, HabitId, Month } from "@/types/habit";

const EMPTY_DATE_SET: ReadonlySet<DateKey> = new Set();

export function HabitTracker() {
  const habits: Habit[] = DEFAULT_HABITS;

  const today = useToday();
  const completions = useCompletions();

  /** `null` means "follow the current month"; navigation pins a month here. */
  const [pinnedMonth, setPinnedMonth] = useState<Month | null>(null);

  const viewedMonth = useMemo(
    () => pinnedMonth ?? (today ? getMonthOf(today) : null),
    [pinnedMonth, today],
  );

  const days = useMemo(
    () => (viewedMonth && today ? getCalendarDays(viewedMonth, today) : []),
    [viewedMonth, today],
  );

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

  const toggleCompletion = useCallback((habitId: HabitId, dateKey: DateKey) => {
    updateCompletions((previous) => {
      const next = { ...previous };
      const completedOnDate = { ...previous[dateKey] };

      if (completedOnDate[habitId]) {
        delete completedOnDate[habitId];
      } else {
        completedOnDate[habitId] = true;
      }

      if (Object.keys(completedOnDate).length === 0) {
        delete next[dateKey];
      } else {
        next[dateKey] = completedOnDate;
      }

      return next;
    });
  }, []);

  const goToPreviousMonth = useCallback(() => {
    if (viewedMonth) setPinnedMonth(addMonths(viewedMonth, -1));
  }, [viewedMonth]);

  const goToNextMonth = useCallback(() => {
    if (viewedMonth) setPinnedMonth(addMonths(viewedMonth, 1));
  }, [viewedMonth]);

  const goToCurrentMonth = useCallback(() => setPinnedMonth(null), []);

  const isReady = today !== null && viewedMonth !== null;

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-sm font-semibold uppercase tracking-[0.18em] text-ink-muted">
          Habit Tracker
        </h1>

        {isReady ? (
          <MonthSelector
            month={viewedMonth}
            isCurrentMonth={isSameMonth(viewedMonth, getMonthOf(today))}
            onPreviousMonth={goToPreviousMonth}
            onNextMonth={goToNextMonth}
            onCurrentMonth={goToCurrentMonth}
          />
        ) : null}
      </header>

      <div className="overflow-hidden rounded-xl border border-line bg-panel">
        {isReady ? (
          <div className="calendar-scroll overflow-x-auto">
            <div
              role="grid"
              aria-label={`Habit completion grid for the selected month, ${days.length} days`}
              className="grid min-w-max [--day-col:2.25rem] [--habit-col:9.5rem] sm:[--day-col:2.5rem] sm:[--habit-col:13rem]"
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
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="flex h-[27rem] items-center justify-center text-sm text-ink-faint">
            Loading your tracker…
          </div>
        )}
      </div>

      <p className="text-xs text-ink-faint">
        Click a cell to mark a habit complete. Your progress is saved in this browser only.
      </p>
    </section>
  );
}
