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
      isWeekend: weekday === 0 || weekday === 6,
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
