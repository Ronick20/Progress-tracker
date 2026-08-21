/** A habit the user wants to track. Ids are stable so labels can be renamed freely. */
export interface Habit {
  id: HabitId;
  name: string;
}

export type HabitId = string;

/** A calendar date in local time, formatted as `YYYY-MM-DD`. */
export type DateKey = string;

/** A year/month pair. `month` is 0-indexed, matching the JavaScript `Date` API. */
export interface Month {
  year: number;
  month: number;
}

/** One column of the tracker grid. */
export interface CalendarDay {
  date: Date;
  key: DateKey;
  dayOfMonth: number;
  /** Short weekday label, e.g. `Fri`. */
  weekdayLabel: string;
  isWeekend: boolean;
  isToday: boolean;
}

/**
 * Completed habits, grouped by date. Only completions are stored: a habit that
 * is absent for a date is simply not done, which keeps the payload small.
 */
export type CompletionMap = Record<DateKey, Record<HabitId, true> | undefined>;
