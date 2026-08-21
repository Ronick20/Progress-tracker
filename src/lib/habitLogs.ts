import { getMonthRange } from "@/lib/dates";
import { getSupabaseClient } from "@/lib/supabase";
import type { CompletionMap, DateKey, HabitId, Month } from "@/types/habit";

/**
 * The completions for a single month, as one request.
 *
 * Only the visible month's rows are fetched — never the whole table — and rows
 * that are explicitly `completed = false` are dropped, so the resulting map
 * contains just the ticked cells the grid needs to render.
 */
export async function fetchMonthCompletions(month: Month): Promise<CompletionMap> {
  const { start, end } = getMonthRange(month);

  const { data, error } = await getSupabaseClient()
    .from("habit_logs")
    .select("habit_id, date, completed")
    .gte("date", start)
    .lte("date", end);

  if (error) throw error;

  const completions: CompletionMap = {};

  for (const row of data ?? []) {
    if (!row.completed) continue;

    const forDate = completions[row.date] ?? {};
    forDate[row.habit_id] = true;
    completions[row.date] = forDate;
  }

  return completions;
}

/**
 * Records whether a habit was completed on a date.
 *
 * The `(habit_id, date)` unique constraint lets this be a single upsert: the
 * first tick inserts the row, and every later change — including unticking,
 * which writes `completed = false` — updates that same row. One habit/date
 * combination can therefore never end up with two conflicting records.
 */
export async function setHabitCompletion(
  habitId: HabitId,
  date: DateKey,
  completed: boolean,
): Promise<void> {
  const { error } = await getSupabaseClient()
    .from("habit_logs")
    .upsert({ habit_id: habitId, date, completed }, { onConflict: "habit_id,date" });

  if (error) throw error;
}

/**
 * Writes many completions at once. Used only by the one-time localStorage
 * migration; normal toggling goes through `setHabitCompletion`.
 */
export async function upsertCompletions(
  rows: { habitId: HabitId; date: DateKey; completed: boolean }[],
): Promise<void> {
  if (rows.length === 0) return;

  const { error } = await getSupabaseClient()
    .from("habit_logs")
    .upsert(
      rows.map((row) => ({ habit_id: row.habitId, date: row.date, completed: row.completed })),
      { onConflict: "habit_id,date" },
    );

  if (error) throw error;
}
