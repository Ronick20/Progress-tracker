"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { TaskPanel } from "@/components/TaskPanel";
import {
  createTask,
  deleteTask,
  fetchTasksForDates,
  updateTask,
} from "@/lib/dailyTasks";
import { addDays, formatShortDate, toDateKey } from "@/lib/dates";
import { SupabaseConfigError } from "@/lib/supabase";
import type { DailyTask, DateKey } from "@/types/habit";

const LOAD_ERROR_MESSAGE = "Unable to load your tasks. Check your connection and try again.";
const SAVE_ERROR_MESSAGE = "Unable to save your task change. Please try again.";

interface DailyTasksProps {
  today: Date;
}

/**
 * The two task lists below the grid: what today holds — written yesterday, and
 * ticked off today — and the plan being written for tomorrow.
 */
export function DailyTasks({ today }: DailyTasksProps) {
  const tomorrow = useMemo(() => addDays(today, 1), [today]);
  const todayKey = toDateKey(today);
  const tomorrowKey = toDateKey(tomorrow);

  const [tasks, setTasks] = useState<DailyTask[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    // Discards a response that arrives after the dates it was fetched for have
    // changed — which happens when a retry supersedes an in-flight request.
    let active = true;

    void (async () => {
      try {
        const loaded = await fetchTasksForDates([todayKey, tomorrowKey]);
        if (!active) return;

        setTasks(loaded);
        setLoadError(null);
      } catch (error) {
        if (!active) return;

        console.error("[habit-tracker] failed to load tasks", error);
        setLoadError(
          error instanceof SupabaseConfigError ? error.message : LOAD_ERROR_MESSAGE,
        );
      }
    })();

    return () => {
      active = false;
    };
  }, [todayKey, tomorrowKey, retryCount]);

  const tasksFor = useCallback(
    (date: DateKey) => (tasks ?? []).filter((task) => task.date === date),
    [tasks],
  );

  /** Adding awaits the write, so the new task appears with its real database id. */
  const addTask = useCallback(
    async (date: DateKey, title: string, description: string) => {
      const existing = (tasks ?? []).filter((task) => task.date === date);
      const sortOrder =
        existing.reduce((highest, task) => Math.max(highest, task.sortOrder), 0) + 1;

      try {
        const created = await createTask({ date, title, description, sortOrder });
        setTasks((previous) => [...(previous ?? []), created]);
        setSaveError(null);
      } catch (error) {
        console.error("[habit-tracker] failed to add task", error);
        setSaveError(SAVE_ERROR_MESSAGE);
      }
    },
    [tasks],
  );

  /**
   * Ticking and editing are optimistic: the change shows immediately, then the
   * row is written. A failed write restores the task exactly as it was, so the
   * panel never shows something the database does not have.
   */
  const applyChange = useCallback(
    (task: DailyTask, changes: { title?: string; description?: string; completed?: boolean }) => {
      setTasks((previous) =>
        (previous ?? []).map((item) =>
          item.id === task.id ? { ...item, ...changes } : item,
        ),
      );
      setSaveError(null);

      void (async () => {
        try {
          await updateTask(task.id, changes);
        } catch (error) {
          console.error("[habit-tracker] failed to save task", error);

          setTasks((previous) =>
            (previous ?? []).map((item) => (item.id === task.id ? task : item)),
          );
          setSaveError(SAVE_ERROR_MESSAGE);
        }
      })();
    },
    [],
  );

  const toggleTask = useCallback(
    (task: DailyTask) => applyChange(task, { completed: !task.completed }),
    [applyChange],
  );

  const editTask = useCallback(
    (taskId: string, changes: { title: string; description: string }) => {
      const task = (tasks ?? []).find((item) => item.id === taskId);
      if (task) applyChange(task, changes);
    },
    [tasks, applyChange],
  );

  /** Deletion is permanent, so it is confirmed before anything is removed. */
  const removeTask = useCallback((task: DailyTask) => {
    if (!window.confirm(`Delete the task “${task.title}”?`)) return;

    setTasks((previous) => (previous ?? []).filter((item) => item.id !== task.id));
    setSaveError(null);

    void (async () => {
      try {
        await deleteTask(task.id);
      } catch (error) {
        console.error("[habit-tracker] failed to delete task", error);

        setTasks((previous) => [...(previous ?? []), task]);
        setSaveError(SAVE_ERROR_MESSAGE);
      }
    })();
  }, []);

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-line bg-panel px-6 py-10 text-center">
        <p className="max-w-sm text-sm text-ink-muted">{loadError}</p>
        <button
          type="button"
          onClick={() => {
            setLoadError(null);
            setRetryCount((count) => count + 1);
          }}
          className="rounded-md border border-line bg-panel-raised px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!tasks) {
    return (
      <div className="rounded-xl border border-line bg-panel px-6 py-10 text-center text-sm text-ink-faint">
        Loading your tasks…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {saveError ? (
        <p
          role="alert"
          className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {saveError}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <TaskPanel
          heading="Today’s tasks"
          dateLabel={formatShortDate(today)}
          emptyMessage="Nothing was planned for today. You can still add a task below."
          placeholder="Add a task for today…"
          tasks={tasksFor(todayKey)}
          showCheckboxes
          onAdd={(title, description) => addTask(todayKey, title, description)}
          onToggle={toggleTask}
          onEdit={editTask}
          onDelete={removeTask}
        />

        <TaskPanel
          heading="Tomorrow’s plan"
          dateLabel={formatShortDate(tomorrow)}
          emptyMessage="Write down what tomorrow needs — it will be waiting, ready to tick off."
          placeholder="Add a task for tomorrow…"
          tasks={tasksFor(tomorrowKey)}
          showCheckboxes={false}
          onAdd={(title, description) => addTask(tomorrowKey, title, description)}
          onToggle={toggleTask}
          onEdit={editTask}
          onDelete={removeTask}
        />
      </div>
    </div>
  );
}
