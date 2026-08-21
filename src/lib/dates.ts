import { useSyncExternalStore } from "react";

import type { CalendarDay, DateKey, Month } from "@/types/habit";

const WEEKDAY_FORMATTER = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const MONTH_FORMATTER = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  day: "numeric",
  month: "short",
});
const FULL_DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

/**
 * The one day of the week that is off. Saturday is a working day here, so only
 * Sunday is excluded: the grid greys it out and the analysis leaves it out of
 * both the days done and the days available, rather than scoring it as missed.
 */
const REST_WEEKDAY = 0;

/** `true` on a Sunday — the day nothing is expected. */
export function isRestDay(date: Date): boolean {
  return date.getDay() === REST_WEEKDAY;
}

/** `true` when a `YYYY-MM-DD` key falls on a Sunday. */
export function isRestDayKey(key: DateKey): boolean {
  return isRestDay(fromDateKey(key));
}

/** The month a given date falls in. */
export function getMonthOf(date: Date): Month {
  return { year: date.getFullYear(), month: date.getMonth() };
}

/**
 * Shifts a month by `delta` months, rolling the year over as needed.
 * `Date` normalises out-of-range month values, so December + 1 becomes January.
 */
export function addMonths(month: Month, delta: number): Month {
  const shifted = new Date(month.year, month.month + delta, 1);
  return getMonthOf(shifted);
}

/**
 * Number of days in a month. Day 0 of the *next* month is the last day of this
 * one, which handles 30/31-day months and leap years without special cases.
 */
export function getDaysInMonth({ year, month }: Month): number {
  return new Date(year, month + 1, 0).getDate();
}

export function isSameMonth(a: Month, b: Month): boolean {
  return a.year === b.year && a.month === b.month;
}

/** Local-time `YYYY-MM-DD` key. Avoids the UTC shift of `toISOString()`. */
export function toDateKey(date: Date): DateKey {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * The inclusive `YYYY-MM-DD` bounds of a month, for querying just that month's
 * logs. `getDaysInMonth` already handles 30/31-day months and leap years.
 */
export function getMonthRange(month: Month): { start: DateKey; end: DateKey } {
  return {
    start: toDateKey(new Date(month.year, month.month, 1)),
    end: toDateKey(new Date(month.year, month.month, getDaysInMonth(month))),
  };
}

/** Every day of `month`, in order, ready to render as grid columns. */
export function getCalendarDays(month: Month, today: Date): CalendarDay[] {
  const todayKey = toDateKey(today);

  return Array.from({ length: getDaysInMonth(month) }, (_, index) => {
    const date = new Date(month.year, month.month, index + 1);
    const weekday = date.getDay();

    return {
      date,
      key: toDateKey(date),
      dayOfMonth: index + 1,
      weekdayLabel: WEEKDAY_FORMATTER.format(date),
      isRestDay: weekday === REST_WEEKDAY,
      isToday: toDateKey(date) === todayKey,
    };
  });
}

/** e.g. `August 2026`. */
export function formatMonthLabel({ year, month }: Month): string {
  return MONTH_FORMATTER.format(new Date(year, month, 1));
}

/** The same clock date, `delta` days later (or earlier, when negative). */
export function addDays(date: Date, delta: number): Date {
  const shifted = new Date(date);
  shifted.setDate(shifted.getDate() + delta);
  return shifted;
}

/** e.g. `Friday, 21 August 2026`. Used for headings and accessible cell labels. */
export function formatFullDate(date: Date): string {
  return FULL_DATE_FORMATTER.format(date);
}

/** e.g. `Sat, 22 Aug`. A compact label for the tasks panels. */
export function formatShortDate(date: Date): string {
  return SHORT_DATE_FORMATTER.format(date);
}

/**
 * The current date, or `null` while rendering on the server. The value is
 * cached so every render sees the same `Date` instance, which keeps it usable
 * as a memo dependency.
 */
export function useToday(): Date | null {
  return useSyncExternalStore(subscribeToClock, getToday, getServerToday);
}

let cachedToday: Date | null = null;

function getToday(): Date {
  cachedToday ??= new Date();
  return cachedToday;
}

function getServerToday(): null {
  return null;
}

/** The clock is read once on mount; it never pushes updates. */
function subscribeToClock(): () => void {
  return () => {};
}

/** Turns a local `YYYY-MM-DD` key back into a local-midnight `Date`. */
export function fromDateKey(key: DateKey): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Whole days from `start` to `end`, both as date keys. Computed from the local
 * calendar dates rather than by dividing milliseconds, so a daylight-saving
 * change inside the range cannot shift the count by a day.
 */
export function daysBetween(start: DateKey, end: DateKey): number {
  const startUtc = Date.UTC(...toParts(start));
  const endUtc = Date.UTC(...toParts(end));
  return Math.round((endUtc - startUtc) / 86_400_000);
}

/** The earlier of two date keys. Keys sort lexicographically by date. */
export function minDateKey(a: DateKey, b: DateKey): DateKey {
  return a <= b ? a : b;
}

function toParts(key: DateKey): [number, number, number] {
  const [year, month, day] = key.split("-").map(Number);
  return [year, month - 1, day];
}

/**
 * How many days between `start` and `end` inclusive are actually expected —
 * every day except Sunday. This is the denominator the analysis divides by, so
 * a habit is never marked down for a rest day.
 */
export function countActiveDays(start: DateKey, end: DateKey): number {
  const total = daysBetween(start, end) + 1;
  if (total <= 0) return 0;

  // Offset of the first Sunday in the range, then one every seven days after it.
  const firstRest = (7 - fromDateKey(start).getDay()) % 7;
  const restDays = firstRest >= total ? 0 : 1 + Math.floor((total - 1 - firstRest) / 7);

  return total - restDays;
}

/** The next day that is expected — tomorrow, or Monday when tomorrow is Sunday. */
export function nextActiveDay(date: Date): Date {
  const next = addDays(date, 1);
  return isRestDay(next) ? addDays(next, 1) : next;
}

/** The previous expected day — yesterday, or Saturday when yesterday is Sunday. */
export function previousActiveDay(date: Date): Date {
  const previous = addDays(date, -1);
  return isRestDay(previous) ? addDays(previous, -1) : previous;
}
