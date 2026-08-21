import {
  addDays,
  countActiveDays,
  daysBetween,
  isRestDay,
  fromDateKey,
  isRestDayKey,
  minDateKey,
  nextActiveDay,
  previousActiveDay,
  toDateKey,
} from "@/lib/dates";
import { getSupabaseClient } from "@/lib/supabase";
import type { DateKey, Habit, HabitId } from "@/types/habit";

/**
 * How many recent days count as "lately". Long enough to be more than a bad
 * week, short enough that a habit fixed a month ago stops being flagged. This
 * is a span of calendar days; the Sundays inside it are not scored.
 */
export const RECENT_WINDOW_DAYS = 30;

/**
 * A habit needs at least this much history before the analysis will call it
 * the one to fix. Two days of data is noise, not a verdict.
 */
export const MIN_DAYS_FOR_VERDICT = 7;

/** How much of the "needs work" score comes from all-time vs. recent form. */
const OVERALL_WEIGHT = 0.6;
const RECENT_WEIGHT = 1 - OVERALL_WEIGHT;

/** One habit, scored over its whole history. */
export interface HabitStats {
  habitId: HabitId;
  name: string;
  /** First day this habit could have been done: its creation, or its first ever tick. */
  startDate: DateKey;
  /**
   * Expected days from `startDate` to today, inclusive — every day except
   * Sunday. The denominator for `rate`.
   */
  trackedDays: number;
  /** Calendar days in the same span, Sundays included. Used for wording only. */
  calendarDays: number;
  doneDays: number;
  /** `trackedDays - doneDays` — the days it was skipped. */
  missedDays: number;
  /** `doneDays / trackedDays`, 0–1. */
  rate: number;
  /** The same rate over the last `RECENT_WINDOW_DAYS` (clipped to the history). */
  recentRate: number;
  /** Calendar days the recent window spans, so it can be described honestly. */
  recentWindowDays: number;
  /** Recent rate minus all-time rate: positive is improving, negative is slipping. */
  trend: number;
  /** Consecutive days done, counting back from today (or yesterday, if today is still open). */
  currentStreak: number;
  longestStreak: number;
  /** `0` when done today, `null` when never done. */
  daysSinceLastDone: number | null;
  /** 0–1, higher means more in need of attention. Drives the focus pick. */
  needsWorkScore: number;
  /** `false` when there is too little history to judge it. */
  hasEnoughHistory: boolean;
}

/** Everything the analysis panel renders. */
export interface ProgressAnalysis {
  /** Worst first — the order the chart draws them in. */
  habits: HabitStats[];
  /** The earliest day any habit was being tracked. */
  since: DateKey | null;
  /** Habit-days completed and available across every habit. */
  totalDone: number;
  totalTracked: number;
  /** `totalDone / totalTracked`, 0–1. */
  overallRate: number;
  /** The habit to fix next, or `null` when nothing has enough history. */
  focus: HabitStats | null;
  /** The strongest habit, for contrast with the focus one. */
  strongest: HabitStats | null;
}

/** One completed habit/date pair, as stored. */
export interface CompletedLog {
  habitId: HabitId;
  date: DateKey;
}

/**
 * Every day ever ticked off, for every habit.
 *
 * The analysis is all-time, so unlike the grid this is not scoped to a month.
 * Only `completed = true` rows are asked for: an unticked day is written as
 * `completed = false`, and for counting purposes that is the same as no row at
 * all. Two columns per row keeps the payload small even after years of use.
 */
export async function fetchAllCompletedLogs(): Promise<CompletedLog[]> {
  const { data, error } = await getSupabaseClient()
    .from("habit_logs")
    .select("habit_id, date")
    .eq("completed", true);

  if (error) throw error;

  return (data ?? []).map((row) => ({ habitId: row.habit_id, date: row.date }));
}

/**
 * Scores every habit over its whole history and picks the one to improve.
 *
 * Each habit is judged against its *own* window — from the day it was created
 * (or its first tick, if history was imported) up to today — so a habit added
 * last week is not punished for the months before it existed. Within that
 * window every day is either done or missed; there is no third state, which is
 * what makes achievement and procrastination two halves of one bar.
 *
 * Sundays are the exception, and they are not a third state — they are removed
 * from the window altogether. A rest day is neither an achievement nor a
 * missed day, so counting it either way would misreport the week. Saturday is
 * an ordinary working day and is scored like any other.
 *
 * The focus pick is deliberately not just "lowest percentage". A habit that was
 * poor for months but has been solid lately is being fixed already; one that
 * used to be fine and has now been dropped is the more useful thing to be told
 * about. Both are folded into `needsWorkScore`, weighted towards the all-time
 * number because the question asked is about overall progress.
 */
export function analyseProgress(
  habits: Habit[],
  logs: CompletedLog[],
  today: Date,
): ProgressAnalysis {
  const todayKey = toDateKey(today);
  const datesByHabit = groupDatesByHabit(logs);

  const stats = habits.map((habit) =>
    scoreHabit(habit, datesByHabit.get(habit.id) ?? new Set(), todayKey, today),
  );

  const totalDone = stats.reduce((sum, stat) => sum + stat.doneDays, 0);
  const totalTracked = stats.reduce((sum, stat) => sum + stat.trackedDays, 0);

  const since = stats.reduce<DateKey | null>(
    (earliest, stat) => (earliest === null ? stat.startDate : minDateKey(earliest, stat.startDate)),
    null,
  );

  // Only habits with real history are eligible to be named — but if none has
  // any yet, fall back to the whole list rather than showing nothing.
  const judgeable = stats.filter((stat) => stat.hasEnoughHistory);
  const candidates = judgeable.length > 0 ? judgeable : stats;

  const focus =
    candidates.length > 0
      ? candidates.reduce((worst, stat) => (isWorseThan(stat, worst) ? stat : worst))
      : null;

  const strongest =
    candidates.length > 0
      ? candidates.reduce((best, stat) => (stat.rate > best.rate ? stat : best))
      : null;

  return {
    // Worst first: the chart's job is to put the problem at the top.
    habits: [...stats].sort((a, b) => a.rate - b.rate || b.missedDays - a.missedDays),
    since,
    totalDone,
    totalTracked,
    overallRate: totalTracked > 0 ? totalDone / totalTracked : 0,
    // A habit that has never been missed is not a problem to solve.
    focus: focus && focus.missedDays > 0 ? focus : null,
    strongest,
  };
}

/** `true` when `stat` is more in need of attention than `worst`. */
function isWorseThan(stat: HabitStats, worst: HabitStats): boolean {
  if (stat.needsWorkScore !== worst.needsWorkScore) {
    return stat.needsWorkScore > worst.needsWorkScore;
  }

  // Same score: prefer the habit that has been left alone the longest, then
  // the one with more missed days behind it.
  const stale = stat.daysSinceLastDone ?? Number.MAX_SAFE_INTEGER;
  const worstStale = worst.daysSinceLastDone ?? Number.MAX_SAFE_INTEGER;
  if (stale !== worstStale) return stale > worstStale;

  return stat.missedDays > worst.missedDays;
}

function groupDatesByHabit(logs: CompletedLog[]): Map<HabitId, Set<DateKey>> {
  const byHabit = new Map<HabitId, Set<DateKey>>();

  for (const log of logs) {
    const dates = byHabit.get(log.habitId) ?? new Set<DateKey>();
    dates.add(log.date);
    byHabit.set(log.habitId, dates);
  }

  return byHabit;
}

function scoreHabit(
  habit: Habit,
  completedDates: ReadonlySet<DateKey>,
  todayKey: DateKey,
  today: Date,
): HabitStats {
  const sorted = [...completedDates].sort();

  // Imported history can predate the habit row itself, so the window starts at
  // whichever came first. Anything ticked in the future is ignored entirely.
  const earliestTick = sorted.length > 0 ? sorted[0] : null;
  const startDate = earliestTick
    ? minDateKey(habit.createdAt, earliestTick)
    : minDateKey(habit.createdAt, todayKey);

  const calendarDays = daysBetween(startDate, todayKey) + 1;
  const trackedDays = countActiveDays(startDate, todayKey);

  // Ticks on a Sunday are dropped rather than counted: the day is outside the
  // window, so letting it into the numerator could push a habit past 100%.
  const inWindow = sorted.filter(
    (date) => date >= startDate && date <= todayKey && !isRestDayKey(date),
  );
  const doneDays = inWindow.length;
  const missedDays = Math.max(0, trackedDays - doneDays);
  const rate = trackedDays > 0 ? doneDays / trackedDays : 0;

  // The recent window is a span of calendar days, but is scored on the expected
  // days inside it — the same rule as the all-time figure.
  const recentWindowDays = Math.min(RECENT_WINDOW_DAYS, calendarDays);
  const recentStart = toDateKey(addDays(today, -(recentWindowDays - 1)));
  const recentTrackedDays = countActiveDays(recentStart, todayKey);
  const recentDone = inWindow.filter((date) => date >= recentStart).length;
  const recentRate = recentTrackedDays > 0 ? recentDone / recentTrackedDays : 0;

  const lastDone = inWindow.length > 0 ? inWindow[inWindow.length - 1] : null;

  return {
    habitId: habit.id,
    name: habit.name,
    startDate,
    trackedDays,
    calendarDays,
    doneDays,
    missedDays,
    rate,
    recentRate,
    recentWindowDays,
    trend: recentRate - rate,
    currentStreak: countCurrentStreak(completedDates, todayKey, today),
    longestStreak: countLongestStreak(inWindow),
    daysSinceLastDone: lastDone ? daysBetween(lastDone, todayKey) : null,
    needsWorkScore: OVERALL_WEIGHT * (1 - rate) + RECENT_WEIGHT * (1 - recentRate),
    hasEnoughHistory: trackedDays >= MIN_DAYS_FOR_VERDICT,
  };
}

/**
 * Consecutive expected days done, counting back from today. Two days are
 * skipped over rather than counted against you: today, because it is not over
 * yet, and any Sunday, because a rest day should not end a streak.
 */
function countCurrentStreak(
  completedDates: ReadonlySet<DateKey>,
  todayKey: DateKey,
  today: Date,
): number {
  let cursor =
    !isRestDay(today) && completedDates.has(todayKey) ? today : previousActiveDay(today);
  let streak = 0;

  while (completedDates.has(toDateKey(cursor))) {
    streak += 1;
    cursor = previousActiveDay(cursor);
  }

  return streak;
}

/**
 * The longest run of consecutive expected days done, over an ascending list of
 * dates that already has its Sundays removed. A Saturday followed by a Monday
 * is unbroken, because the Sunday between them was never expected.
 */
function countLongestStreak(ascendingDates: DateKey[]): number {
  let longest = 0;
  let run = 0;
  let previous: DateKey | null = null;

  for (const date of ascendingDates) {
    const followsPrevious =
      previous !== null && toDateKey(nextActiveDay(fromDateKey(previous))) === date;

    run = followsPrevious ? run + 1 : 1;
    if (run > longest) longest = run;
    previous = date;
  }

  return longest;
}

/** e.g. `72%`. Rounded to whole numbers — the chart is not a spreadsheet. */
export function formatPercent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}
