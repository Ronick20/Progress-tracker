"use client";

import { HabitCell } from "@/components/HabitCell";
import type { CalendarDay, DateKey, Habit, HabitId } from "@/types/habit";

interface HabitRowProps {
  habit: Habit;
  days: CalendarDay[];
  /** Dates on which this habit is completed. */
  completedDates: ReadonlySet<DateKey>;
  onToggle: (habitId: HabitId, dateKey: DateKey) => void;
}

export function HabitRow({ habit, days, completedDates, onToggle }: HabitRowProps) {
  return (
    <div role="row" className="group contents">
      <div
        role="rowheader"
        title={habit.name}
        className="sticky left-0 z-20 flex items-center border-b border-r border-line bg-panel px-3 text-sm text-ink transition-colors group-hover:bg-panel-raised"
      >
        <span className="truncate">{habit.name}</span>
      </div>

      {days.map((day) => (
        <HabitCell
          key={day.key}
          habitName={habit.name}
          day={day}
          completed={completedDates.has(day.key)}
          onToggle={() => onToggle(habit.id, day.key)}
        />
      ))}
    </div>
  );
}
