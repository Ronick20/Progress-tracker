import { getSupabaseClient } from "@/lib/supabase";
import type { DailyTask, DateKey } from "@/types/habit";

export const TASK_TITLE_MAX_LENGTH = 120;
export const TASK_DESCRIPTION_MAX_LENGTH = 2000;

/**
 * Every task on the given dates, oldest position first.
 *
 * The tasks panel shows exactly two days — today and tomorrow — so both are
 * fetched in a single request rather than one per day.
 */
export async function fetchTasksForDates(dates: DateKey[]): Promise<DailyTask[]> {
  if (dates.length === 0) return [];

  const { data, error } = await getSupabaseClient()
    .from("daily_tasks")
    .select("id, date, title, description, completed, sort_order")
    .in("date", dates)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw error;

  return (data ?? []).map(toTask);
}

/** Adds a task to a date, at the end of that date's list. */
export async function createTask(input: {
  date: DateKey;
  title: string;
  description: string;
  sortOrder: number;
}): Promise<DailyTask> {
  const { data, error } = await getSupabaseClient()
    .from("daily_tasks")
    .insert({
      date: input.date,
      title: input.title,
      description: input.description || null,
      sort_order: input.sortOrder,
    })
    .select("id, date, title, description, completed, sort_order")
    .single();

  if (error) throw error;

  return toTask(data);
}

/**
 * Changes one or more fields of a task. Ticking the checkbox and editing the
 * text both go through here, so there is a single write path for a task row.
 */
export async function updateTask(
  taskId: string,
  changes: { title?: string; description?: string; completed?: boolean },
): Promise<void> {
  const { error } = await getSupabaseClient()
    .from("daily_tasks")
    .update({
      ...(changes.title === undefined ? {} : { title: changes.title }),
      ...(changes.description === undefined
        ? {}
        : { description: changes.description || null }),
      ...(changes.completed === undefined ? {} : { completed: changes.completed }),
    })
    .eq("id", taskId);

  if (error) throw error;
}

export async function deleteTask(taskId: string): Promise<void> {
  const { error } = await getSupabaseClient().from("daily_tasks").delete().eq("id", taskId);

  if (error) throw error;
}

/** Trimmed and length-capped title, or `null` when nothing usable was typed. */
export function normaliseTaskTitle(title: string): string | null {
  const trimmed = title.trim().slice(0, TASK_TITLE_MAX_LENGTH);
  return trimmed.length > 0 ? trimmed : null;
}

export function normaliseTaskDescription(description: string): string {
  return description.trim().slice(0, TASK_DESCRIPTION_MAX_LENGTH);
}

function toTask(row: {
  id: string;
  date: string;
  title: string;
  description: string | null;
  completed: boolean;
  sort_order: number;
}): DailyTask {
  return {
    id: row.id,
    date: row.date,
    title: row.title,
    // The column is nullable, but the UI only ever deals in strings.
    description: row.description ?? "",
    completed: row.completed,
    sortOrder: row.sort_order,
  };
}
