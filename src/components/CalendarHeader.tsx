"use client";

import type { CalendarDay } from "@/types/habit";

interface CalendarHeaderProps {
  days: CalendarDay[];
}

export function CalendarHeader({ days }: CalendarHeaderProps) {
  return (
    <div role="row" className="contents">
      <div
        role="columnheader"
        className="sticky left-0 z-30 flex items-center border-b border-r border-line bg-panel px-3 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-ink-faint"
      >
        My Habits
      </div>

      {days.map((day) => (
        <div
          key={day.key}
          role="columnheader"
          aria-current={day.isToday ? "date" : undefined}
          className={`flex h-12 flex-col items-center justify-center gap-0.5 border-b border-line ${
            day.isToday ? "bg-accent/[0.06]" : ""
          }`}
        >
          <span
            className={`text-xs font-semibold tabular-nums ${
              day.isToday ? "text-accent" : day.isWeekend ? "text-ink-faint" : "text-ink"
            }`}
          >
            {day.dayOfMonth}
          </span>
          <span
            className={`text-[0.55rem] uppercase tracking-wide ${
              day.isToday ? "text-accent/80" : "text-ink-faint"
            }`}
          >
            {day.isToday ? "Today" : day.weekdayLabel}
          </span>
        </div>
      ))}
    </div>
  );
}
