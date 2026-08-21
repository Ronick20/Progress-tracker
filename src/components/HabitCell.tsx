"use client";

import { formatFullDate } from "@/lib/dates";
import type { CalendarDay } from "@/types/habit";

interface HabitCellProps {
  habitName: string;
  day: CalendarDay;
  completed: boolean;
  onToggle: () => void;
}

export function HabitCell({ habitName, day, completed, onToggle }: HabitCellProps) {
  return (
    <div
      role="gridcell"
      className={`flex h-9 items-center justify-center border-b border-line p-[3px] sm:h-10 ${
        day.isToday ? "bg-accent/[0.06]" : ""
      }`}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={completed}
        aria-label={`${habitName} on ${formatFullDate(day.date)}`}
        title={`${habitName} — ${formatFullDate(day.date)}`}
        onClick={onToggle}
        className={`flex size-full items-center justify-center rounded-[5px] border transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${
          completed
            ? "border-accent-strong bg-accent-strong/80 text-surface hover:bg-accent-strong"
            : "border-line-strong/70 bg-panel-raised text-transparent hover:border-line-strong hover:bg-white/[0.06]"
        }`}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-3.5">
          <path
            d="M5 12.5 10 17.5 19 7"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
}
