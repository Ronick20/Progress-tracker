"use client";

import { useState } from "react";

import { TaskItem } from "@/components/TaskItem";
import {
  TASK_DESCRIPTION_MAX_LENGTH,
  TASK_TITLE_MAX_LENGTH,
  normaliseTaskDescription,
  normaliseTaskTitle,
} from "@/lib/dailyTasks";
import type { DailyTask } from "@/types/habit";

interface TaskPanelProps {
  heading: string;
  /** The date the panel covers, e.g. `Sat, 22 Aug`. */
  dateLabel: string;
  /** Shown when there are no tasks yet. */
  emptyMessage: string;
  placeholder: string;
  tasks: DailyTask[];
  /** Today's tasks can be ticked off; a day still being planned cannot. */
  showCheckboxes: boolean;
  onAdd: (title: string, description: string) => Promise<void>;
  onToggle: (task: DailyTask) => void;
  onEdit: (taskId: string, changes: { title: string; description: string }) => void;
  onDelete: (task: DailyTask) => void;
}

export function TaskPanel({
  heading,
  dateLabel,
  emptyMessage,
  placeholder,
  tasks,
  showCheckboxes,
  onAdd,
  onToggle,
  onEdit,
  onDelete,
}: TaskPanelProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const trimmedTitle = normaliseTaskTitle(title);
  const doneCount = tasks.filter((task) => task.completed).length;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!trimmedTitle || isSaving) return;

    setIsSaving(true);
    try {
      await onAdd(trimmedTitle, normaliseTaskDescription(description));
      // Cleared only after the write succeeds, so a failed save does not lose
      // what was typed.
      setTitle("");
      setDescription("");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="flex flex-col rounded-xl border border-line bg-panel">
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-line px-4 py-3">
        <h3 className="text-sm font-semibold tracking-tight text-ink">
          {heading}
          <span className="ml-2 text-xs font-normal text-ink-faint">{dateLabel}</span>
        </h3>

        {tasks.length > 0 ? (
          <span className="text-xs tabular-nums text-ink-faint">
            {showCheckboxes
              ? `${doneCount}/${tasks.length} done`
              : `${tasks.length} planned`}
          </span>
        ) : null}
      </header>

      {tasks.length > 0 ? (
        <ul className="flex flex-col gap-2 p-3">
          {tasks.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              showCheckbox={showCheckboxes}
              onToggle={onToggle}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </ul>
      ) : (
        <p className="px-4 py-6 text-center text-sm text-ink-faint">{emptyMessage}</p>
      )}

      <form onSubmit={submit} className="mt-auto flex flex-col gap-2 border-t border-line p-3">
        <input
          value={title}
          maxLength={TASK_TITLE_MAX_LENGTH}
          placeholder={placeholder}
          aria-label={`New task for ${dateLabel}`}
          onChange={(event) => setTitle(event.target.value)}
          className="rounded-md border border-line bg-panel-raised px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-faint outline-none focus-visible:border-accent/60"
        />

        <textarea
          value={description}
          rows={2}
          maxLength={TASK_DESCRIPTION_MAX_LENGTH}
          placeholder="Description (optional) — details, time, notes…"
          aria-label={`Description for the new task on ${dateLabel}`}
          onChange={(event) => setDescription(event.target.value)}
          className="resize-y rounded-md border border-line bg-panel-raised px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-faint outline-none focus-visible:border-accent/60"
        />

        <button
          type="submit"
          disabled={!trimmedTitle || isSaving}
          className="self-end rounded-md border border-accent-strong bg-accent-strong/80 px-3 py-1.5 text-xs font-semibold text-surface transition-colors hover:bg-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-40"
        >
          {isSaving ? "Adding…" : "Add task"}
        </button>
      </form>
    </section>
  );
}
