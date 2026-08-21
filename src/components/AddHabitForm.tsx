"use client";

import { useState } from "react";

import { HABIT_NAME_MAX_LENGTH, normaliseHabitName } from "@/lib/habits";

interface AddHabitFormProps {
  /** Resolves once the habit has been saved, so the field clears only then. */
  onAdd: (name: string) => Promise<void>;
}

export function AddHabitForm({ onAdd }: AddHabitFormProps) {
  const [name, setName] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const trimmedName = normaliseHabitName(name);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!trimmedName || isSaving) return;

    setIsSaving(true);
    try {
      await onAdd(trimmedName);
      setName("");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="flex items-center gap-2 border-t border-line bg-panel px-3 py-2.5"
    >
      <input
        value={name}
        maxLength={HABIT_NAME_MAX_LENGTH}
        placeholder="Add a habit…"
        aria-label="New habit name"
        onChange={(event) => setName(event.target.value)}
        className="w-full max-w-xs min-w-0 rounded-md border border-line bg-panel-raised px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-faint focus-visible:border-accent/60 focus-visible:outline-none"
      />

      <button
        type="submit"
        disabled={!trimmedName || isSaving}
        className="shrink-0 rounded-md border border-accent-strong bg-accent-strong/80 px-3 py-1.5 text-xs font-semibold text-surface transition-colors hover:bg-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-40"
      >
        {isSaving ? "Adding…" : "Add habit"}
      </button>
    </form>
  );
}
