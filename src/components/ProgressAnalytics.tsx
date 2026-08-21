"use client";

import { useEffect, useMemo, useState } from "react";

import {
  analyseProgress,
  fetchAllCompletedLogs,
  formatPercent,
  MIN_DAYS_FOR_VERDICT,
  type CompletedLog,
  type HabitStats,
} from "@/lib/analytics";
import { formatShortDate, fromDateKey } from "@/lib/dates";
import { describeSupabaseError } from "@/lib/supabase";
import type { Habit, HabitId } from "@/types/habit";

const LOAD_ERROR_MESSAGE = "Unable to load your progress analysis.";

interface ProgressAnalyticsProps {
  habits: Habit[];
  today: Date;
  /**
   * Changes whenever a completion is saved, so the analysis re-reads the full
   * history. Ticking a box is rare compared with rendering, so a refetch is
   * cheaper than mirroring every optimistic edit into a second copy of the data.
   */
  refreshKey: number;
}

/**
 * The all-time view of how the habits are going: one bar per habit, split into
 * the days it was done and the days it was skipped, worst first, with a single
 * named habit to work on next.
 *
 * Deliberately independent of the month selector below it — this answers "how
 * am I doing overall", not "how was August".
 */
export function ProgressAnalytics({ habits, today, refreshKey }: ProgressAnalyticsProps) {
  const [logs, setLogs] = useState<CompletedLog[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Discards a response that arrives after a newer one has been requested.
    let active = true;

    void (async () => {
      try {
        const loaded = await fetchAllCompletedLogs();
        if (!active) return;

        setLogs(loaded);
        setError(null);
      } catch (loadError) {
        if (!active) return;

        console.error("[habit-tracker] failed to load analysis", loadError);
        setError(describeSupabaseError(loadError, LOAD_ERROR_MESSAGE));
      }
    })();

    return () => {
      active = false;
    };
  }, [refreshKey]);

  const analysis = useMemo(
    () => (logs ? analyseProgress(habits, logs, today) : null),
    [habits, logs, today],
  );

  if (error) {
    return (
      <div className="rounded-xl border border-line bg-panel px-4 py-3 text-xs text-ink-muted">
        {error}
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="flex h-24 items-center justify-center rounded-xl border border-line bg-panel text-xs text-ink-faint">
        Analysing your progress…
      </div>
    );
  }

  const { habits: stats, focus, since, overallRate, totalDone, totalTracked } = analysis;

  return (
    <section
      aria-label="Overall progress analysis"
      className="flex flex-col gap-3 rounded-xl border border-line bg-panel px-4 py-3"
    >
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h2 className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-ink-faint">
          Overall Progress
        </h2>
        <p className="text-[0.7rem] text-ink-faint">
          All time{since ? ` · since ${formatShortDate(fromDateKey(since))}` : ""}
        </p>
      </header>

      <div className="flex flex-wrap items-stretch gap-3">
        <Headline rate={overallRate} done={totalDone} tracked={totalTracked} />
        <FocusCard focus={focus} />
      </div>

      <Legend />

      {/* Split into two plots on wide screens so a dozen habits still fit in a
          band shallow enough to leave the grid below on screen. The split is
          down the middle of the sorted list, so the left plot holds the worst
          half and reading top-to-bottom stays in order. */}
      <div className="grid gap-x-8 gap-y-4 lg:grid-cols-2">
        {splitInHalf(stats).map((column, index, columns) => (
          <HabitChart
            key={index}
            stats={column}
            // An odd number of habits leaves the second plot a row short; both
            // are padded to the same height so their axes sit on one line.
            rows={Math.max(...columns.map((entries) => entries.length))}
            average={overallRate}
            focusId={focus?.habitId ?? null}
          />
        ))}
      </div>
    </section>
  );
}

/**
 * Splits the sorted habits into the columns the chart is drawn in: one plot
 * below `lg`, two side by side above it. The second column is dropped when it
 * would be empty, so a single habit does not render an empty second axis.
 */
function splitInHalf(stats: HabitStats[]): HabitStats[][] {
  if (stats.length <= 1) return [stats];

  const half = Math.ceil(stats.length / 2);
  return [stats.slice(0, half), stats.slice(half)];
}

/** The one number that answers "how am I doing", with its raw counts under it. */
function Headline({ rate, done, tracked }: { rate: number; done: number; tracked: number }) {
  return (
    <div className="flex min-w-[9rem] flex-1 items-center gap-3 rounded-lg border border-line bg-panel-raised px-3 py-2">
      <span className="text-3xl font-semibold leading-none tracking-tight text-ink tabular-nums">
        {formatPercent(rate)}
      </span>
      <span className="text-[0.7rem] leading-tight text-ink-muted">
        consistency
        <br />
        <span className="text-ink-faint tabular-nums">
          {done.toLocaleString()} done · {(tracked - done).toLocaleString()} missed
        </span>
      </span>
    </div>
  );
}

/** Names the single habit to fix next, and says why it was picked. */
function FocusCard({ focus }: { focus: HabitStats | null }) {
  if (!focus) {
    return (
      <div className="flex flex-[2] items-center rounded-lg border border-line bg-panel-raised px-3 py-2 text-[0.7rem] text-ink-muted">
        Nothing to flag — every habit has been done every day it was tracked. Keep it
        up for {MIN_DAYS_FOR_VERDICT}+ days and this will call out anything that slips.
      </div>
    );
  }

  return (
    <div className="flex flex-[2] flex-col justify-center gap-0.5 rounded-lg border border-miss/40 bg-miss/[0.08] px-3 py-2">
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-miss">
        Improve this one next
      </p>
      <p className="truncate text-sm font-medium text-ink" title={focus.name}>
        {focus.name}
      </p>
      <p className="text-[0.7rem] text-ink-muted tabular-nums">
        {formatPercent(focus.rate)} all time · {plural(focus.missedDays, "day")} missed
        {/* The recent figure only says something new once it covers a shorter
            span than the habit's whole history. */}
        {focus.recentWindowDays < focus.calendarDays
          ? ` · ${formatPercent(focus.recentRate)} in the last ${focus.recentWindowDays} days`
          : ""}
        {focus.daysSinceLastDone !== null && focus.daysSinceLastDone > 1
          ? ` · last done ${plural(focus.daysSinceLastDone, "day")} ago`
          : ""}
      </p>

      {/* Named anyway when nothing has a full week behind it yet, but said out
          loud, so an early call is never mistaken for a settled verdict. */}
      {focus.hasEnoughHistory ? null : (
        <p className="text-[0.7rem] text-ink-faint">
          Early call — only {plural(focus.trackedDays, "day")} of history so far.
        </p>
      )}
    </div>
  );
}

/** e.g. `1 day`, `4 days`. */
function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function Legend() {
  return (
    <div className="flex items-center gap-4 text-[0.7rem] text-ink-muted">
      <span className="flex items-center gap-1.5">
        <span className="size-2 rounded-[2px] bg-accent" aria-hidden="true" />
        Done
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2 rounded-[2px] bg-miss" aria-hidden="true" />
        Missed
      </span>
      <span className="ml-auto hidden text-ink-faint sm:block">
        Every day since the habit started, Sundays off.
      </span>
    </div>
  );
}

/** Where the gridlines and axis ticks sit, as a percentage of tracked days. */
const AXIS_TICKS = [0, 25, 50, 75, 100];

/**
 * One plot: a shared 0–100% scale with gridlines behind it, a row per habit,
 * and a tick axis underneath. Every bar spans the full width because the scale
 * is "share of the days this habit was tracked" — habits have different
 * denominators, so what is comparable between them is where the split falls,
 * not how long the bar is.
 */
function HabitChart({
  stats,
  rows,
  average,
  focusId,
}: {
  stats: HabitStats[];
  rows: number;
  average: number;
  focusId: HabitId | null;
}) {
  return (
    // The label and value columns are variables so the gridline layer and the
    // axis can line up with the plot area without repeating the measurements.
    <div className="[--label-col:7rem] [--value-col:2.5rem] sm:[--label-col:9.5rem]">
      <div className="relative">
        <ul className="flex flex-col gap-1.5">
          {stats.map((stat) => (
            <HabitBar key={stat.habitId} stat={stat} isFocus={stat.habitId === focusId} />
          ))}

          {/* Keeps the plot its full height when this column has fewer habits. */}
          {Array.from({ length: rows - stats.length }, (_, index) => (
            <li key={`spacer-${index}`} className="h-2.5" aria-hidden="true" />
          ))}
        </ul>

        {/* Drawn last, so it sits on top. Every bar spans the whole scale, so
            gridlines behind them would be covered and read nothing. */}
        <Gridlines average={average} />
      </div>

      <AxisTicks average={average} />
    </div>
  );
}

/** The plot area's horizontal extent, inside the label and value columns. */
const PLOT_AREA_CLASS =
  "left-[calc(var(--label-col)+0.5rem)] right-[calc(var(--value-col)+0.5rem)]";

/**
 * Hairline verticals behind the bars, plus a marker for the overall average so
 * every habit can be read as above or below the line you are actually holding.
 */
function Gridlines({ average }: { average: number }) {
  return (
    <div aria-hidden="true" className={`pointer-events-none absolute inset-y-0 ${PLOT_AREA_CLASS}`}>
      {/* Interior ticks only: the ends of the bar already mark 0% and 100%,
          and a line drawn over them just looks like a clipped bar. */}
      {AXIS_TICKS.filter((tick) => tick > 0 && tick < 100).map((tick) => (
        <span
          key={tick}
          className="absolute inset-y-0 w-px bg-surface/60"
          style={{ left: `${tick}%` }}
        />
      ))}

      {/* The average is the one line that must stay readable over a filled
          bar as well as over the gaps between them. */}
      <span
        className="absolute inset-y-0 w-px bg-ink"
        style={{ left: `${average * 100}%` }}
      />
    </div>
  );
}

/** The bottom axis: `0%`…`100%`, with the average called out beneath its line. */
function AxisTicks({ average }: { average: number }) {
  return (
    <div className="mt-1.5 grid grid-cols-[var(--label-col)_1fr_var(--value-col)] gap-2">
      <span />

      <span className="relative block h-7">
        {AXIS_TICKS.map((tick) => (
          <span
            key={tick}
            className="absolute top-0 text-[0.65rem] tabular-nums text-ink-faint"
            style={tickLabelPosition(tick)}
          >
            {tick}%
          </span>
        ))}

        {/* Sits on a second line so it can never overlap a tick label. */}
        <span
          className="absolute top-3.5 whitespace-nowrap text-[0.65rem] tabular-nums text-ink-muted"
          style={tickLabelPosition(Math.round(average * 100))}
        >
          avg {formatPercent(average)}
        </span>
      </span>

      <span />
    </div>
  );
}

/**
 * Keeps a tick label inside the plot: centred on its line, except at the ends
 * where it is pulled flush so `0%` and `100%` do not hang off the edge.
 */
function tickLabelPosition(percent: number): React.CSSProperties {
  if (percent >= 98) return { right: 0 };
  if (percent <= 2) return { left: 0 };
  return { left: `${percent}%`, transform: "translateX(-50%)" };
}

/**
 * One habit as a single split bar: done from the baseline, missed filling the
 * rest, both to the same scale so the two are read as halves of one tracked
 * window rather than as two independent bars.
 */
function HabitBar({ stat, isFocus }: { stat: HabitStats; isFocus: boolean }) {
  const donePercent = stat.rate * 100;

  const summary =
    `${stat.name}: ${formatPercent(stat.rate)} — ${stat.doneDays} done, ` +
    `${stat.missedDays} missed of ${stat.trackedDays} days expected (Sundays off). ` +
    `Last ${stat.recentWindowDays} days: ${formatPercent(stat.recentRate)}. ` +
    `Current streak ${stat.currentStreak}, best ${stat.longestStreak}.`;

  return (
    <li className="grid grid-cols-[var(--label-col)_1fr_var(--value-col)] items-center gap-2">
      <span
        className={`truncate text-[0.75rem] ${isFocus ? "font-medium text-miss" : "text-ink-muted"}`}
        title={stat.name}
      >
        {isFocus ? "▸ " : ""}
        {stat.name}
      </span>

      {/* `title` carries the same numbers the label reads out, so hovering a
          bar explains it without a second rendering path. */}
      <span
        role="img"
        aria-label={summary}
        title={summary}
        className="relative flex h-2.5 w-full items-stretch gap-[2px]"
      >
        {donePercent > 0 ? (
          <span
            className="rounded-[3px] bg-accent"
            style={{ width: `${donePercent}%` }}
            aria-hidden="true"
          />
        ) : null}
        {donePercent < 100 ? (
          <span className="flex-1 rounded-[3px] bg-miss/85" aria-hidden="true" />
        ) : null}
      </span>

      <span
        aria-hidden="true"
        className={`text-right text-[0.7rem] tabular-nums ${
          isFocus ? "text-miss" : "text-ink-muted"
        }`}
      >
        {formatPercent(stat.rate)}
      </span>
    </li>
  );
}
