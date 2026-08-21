"use client";

import { useState } from "react";

import { HabitCell } from "@/components/HabitCell";
import { HABIT_NAME_MAX_LENGTH, normaliseHabitName } from "@/lib/habits";
import type { CalendarDay, DateKey, Habit, HabitId } from "@/types/habit";

interface HabitRowProps {
  habit: Habit;
  days: CalendarDay[];
  /** Dates on which this habit is completed. */
  completedDates: ReadonlySet<DateKey>;
  onToggle: (habitId: HabitId, dateKey: DateKey) => void;
  onRename: (habitId: HabitId, name: string) => void;
  onDelete: (habit: Habit) => void;
}

export function HabitRow({
  habit,
  days,
  completedDates,
  onToggle,
  onRename,
  onDelete,
}: HabitRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftName, setDraftName] = useState(habit.name);

  // The editor opens on the habit's current name, so a rename starts from what
  // is on screen rather than from whatever was last typed.
  function startEditing() {
    setDraftName(habit.name);
    setIsEditing(true);
  }

  function commit() {
    const name = normaliseHabitName(draftName);

    // An empty or unchanged name simply closes the editor: there is nothing to
    // save, and blanking the field should never wipe the habit's label.
    if (name && name !== habit.name) onRename(habit.id, name);

    setIsEditing(false);
  }

  return (
    <div role="row" className="group contents">
      <div
        role="rowheader"
        className="sticky left-0 z-20 flex items-center gap-1 border-b border-r border-line bg-panel pl-3 pr-1.5 text-[0.8125rem] text-ink transition-colors group-hover:bg-panel-raised sm:text-sm"
      >
        {isEditing ? (
          <input
            autoFocus
            value={draftName}
            maxLength={HABIT_NAME_MAX_LENGTH}
            aria-label={`Rename ${habit.name}`}
            onChange={(event) => setDraftName(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") commit();
              if (event.key === "Escape") setIsEditing(false);
            }}
            className="w-full min-w-0 rounded-md border border-accent/60 bg-surface px-2 py-1 text-[0.8125rem] text-ink outline-none sm:text-sm"
          />
        ) : (
          <>
            <span className="min-w-0 flex-1 truncate" title={habit.name}>
              {habit.name}
            </span>

            <span className="flex shrink-0 items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
              <IconButton
                label={`Rename ${habit.name}`}
                onClick={startEditing}
                path="M4 20h4L19 9l-4-4L4 16v4Z"
              />
              <IconButton
                label={`Delete ${habit.name}`}
                onClick={() => onDelete(habit)}
                danger
                path="M6 7h12M10 7V5h4v2m-7 0 .8 12.1a1 1 0 0 0 1 .9h6.4a1 1 0 0 0 1-.9L17 7"
              />
            </span>
          </>
        )}
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

interface IconButtonProps {
  label: string;
  path: string;
  danger?: boolean;
  onClick: () => void;
}

function IconButton({ label, path, danger = false, onClick }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      // The row header is a mouse target for the editor, so the button must not
      // steal focus before its own click handler runs.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={`flex size-6 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-white/[0.06] focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${
        danger ? "hover:text-danger" : "hover:text-ink"
      }`}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-3.5">
        <path
          d={path}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
