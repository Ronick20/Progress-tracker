"use client";

import { formatMonthLabel } from "@/lib/dates";
import type { Month } from "@/types/habit";

interface MonthSelectorProps {
  month: Month;
  isCurrentMonth: boolean;
  onPreviousMonth: () => void;
  onNextMonth: () => void;
  onCurrentMonth: () => void;
}

export function MonthSelector({
  month,
  isCurrentMonth,
  onPreviousMonth,
  onNextMonth,
  onCurrentMonth,
}: MonthSelectorProps) {
  const label = formatMonthLabel(month);

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onCurrentMonth}
        disabled={isCurrentMonth}
        className="mr-1 rounded-md border border-line px-2.5 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:border-line-strong hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-40"
      >
        Today
      </button>

      <NavButton label="Previous month" onClick={onPreviousMonth} direction="previous" />

      <div
        aria-live="polite"
        className="min-w-[9.5rem] text-center text-base font-semibold tracking-tight sm:min-w-[11rem] sm:text-lg"
      >
        {label}
      </div>

      <NavButton label="Next month" onClick={onNextMonth} direction="next" />
    </div>
  );
}

interface NavButtonProps {
  label: string;
  direction: "previous" | "next";
  onClick: () => void;
}

function NavButton({ label, direction, onClick }: NavButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex size-9 items-center justify-center rounded-md border border-line bg-panel-raised text-ink-muted transition-colors hover:border-line-strong hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4">
        <path
          d={direction === "previous" ? "M15 5 8 12l7 7" : "M9 5l7 7-7 7"}
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
