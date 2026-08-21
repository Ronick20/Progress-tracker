"use client";

import { useState } from "react";

import {
  TASK_DESCRIPTION_MAX_LENGTH,
  TASK_TITLE_MAX_LENGTH,
  normaliseTaskDescription,
  normaliseTaskTitle,
} from "@/lib/dailyTasks";
import type { DailyTask } from "@/types/habit";

interface TaskItemProps {
  task: DailyTask;
  /** Today's tasks can be ticked off; a day still being planned cannot. */
  showCheckbox: boolean;
  onToggle: (task: DailyTask) => void;
  onEdit: (taskId: string, changes: { title: string; description: string }) => void;
  onDelete: (task: DailyTask) => void;
}

export function TaskItem({
  task,
  showCheckbox,
  onToggle,
  onEdit,
  onDelete,
}: TaskItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);

  function startEditing() {
    setTitle(task.title);
    setDescription(task.description);
    setIsEditing(true);
  }

  function save() {
    const nextTitle = normaliseTaskTitle(title);
    const nextDescription = normaliseTaskDescription(description);

    // A blank title would leave a task with nothing to identify it, so the edit
    // is abandoned rather than saved.
    if (nextTitle && (nextTitle !== task.title || nextDescription !== task.description)) {
      onEdit(task.id, { title: nextTitle, description: nextDescription });
    }

    setIsEditing(false);
  }

  if (isEditing) {
    return (
      <li className="rounded-lg border border-accent/40 bg-panel-raised p-3">
        <div className="flex flex-col gap-2">
          <input
            autoFocus
            value={title}
            maxLength={TASK_TITLE_MAX_LENGTH}
            aria-label="Task"
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setIsEditing(false);
            }}
            className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm font-medium text-ink outline-none focus-visible:border-accent/60"
          />

          <textarea
            value={description}
            rows={3}
            maxLength={TASK_DESCRIPTION_MAX_LENGTH}
            aria-label="Description"
            placeholder="Description…"
            onChange={(event) => setDescription(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setIsEditing(false);
            }}
            className="resize-y rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-faint outline-none focus-visible:border-accent/60"
          />

          <div className="flex justify-end gap-2">
            <TextButton label="Cancel" onClick={() => setIsEditing(false)} />
            <TextButton label="Save" onClick={save} primary />
          </div>
        </div>
      </li>
    );
  }

  return (
    <li className="group/task flex items-start gap-2.5 rounded-lg border border-line bg-panel-raised p-3 transition-colors hover:border-line-strong">
      {showCheckbox ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={task.completed}
          aria-label={`${task.title} — mark ${task.completed ? "not done" : "done"}`}
          onClick={() => onToggle(task)}
          className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-[5px] border transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${
            task.completed
              ? "border-accent-strong bg-accent-strong/80 text-surface"
              : "border-line-strong/70 bg-panel text-transparent hover:border-line-strong hover:bg-white/[0.06]"
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
      ) : (
        <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-ink-faint" />
      )}

      <div className="min-w-0 flex-1">
        <p
          className={`text-sm font-medium break-words ${
            task.completed ? "text-ink-faint line-through" : "text-ink"
          }`}
        >
          {task.title}
        </p>

        {task.description ? (
          <p
            className={`mt-1 text-xs leading-relaxed whitespace-pre-wrap break-words ${
              task.completed ? "text-ink-faint/70" : "text-ink-muted"
            }`}
          >
            {task.description}
          </p>
        ) : null}
      </div>

      <span className="flex shrink-0 gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover/task:opacity-100">
        <TextButton label="Edit" onClick={startEditing} />
        <TextButton label="Delete" onClick={() => onDelete(task)} danger />
      </span>
    </li>
  );
}

interface TextButtonProps {
  label: string;
  primary?: boolean;
  danger?: boolean;
  onClick: () => void;
}

function TextButton({ label, primary = false, danger = false, onClick }: TextButtonProps) {
  const tone = primary
    ? "border-accent-strong bg-accent-strong/80 text-surface hover:bg-accent-strong"
    : danger
      ? "border-line text-ink-faint hover:border-danger/50 hover:text-danger"
      : "border-line text-ink-faint hover:border-line-strong hover:text-ink";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-2 py-1 text-[0.6875rem] font-medium transition-colors focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${tone}`}
    >
      {label}
    </button>
  );
}
