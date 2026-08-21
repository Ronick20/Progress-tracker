import { toDateKey } from "@/lib/dates";
import { getSupabaseClient } from "@/lib/supabase";
import type { Habit, HabitId } from "@/types/habit";

/** The longest a habit name may be, matching what the row header can show. */
export const HABIT_NAME_MAX_LENGTH = 60;

/**
 * Every active habit, in the order they should appear as grid rows.
 *
 * This is the only source of habits — there is no hardcoded list in the UI.
 * Habits are added, renamed and removed from the app itself, and the change
 * shows up on every device on next load.
 */
export async function fetchHabits(): Promise<Habit[]> {
  const { data, error } = await getSupabaseClient()
    .from("habits")
    .select("id, name, icon, active, sort_order, created_at")
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw error;

  return (data ?? []).map(toHabit);
}

/**
 * Adds a habit as the last row.
 *
 * `sortOrder` is passed in by the caller rather than read back from the
 * database, because the list on screen already knows what the last position is.
 */
export async function createHabit(name: string, sortOrder: number): Promise<Habit> {
  const { data, error } = await getSupabaseClient()
    .from("habits")
    .insert({ name, sort_order: sortOrder })
    .select("id, name, icon, active, sort_order, created_at")
    .single();

  if (error) throw error;

  return toHabit(data);
}

/** Renames a habit. Its logs are keyed by id, so history is untouched. */
export async function renameHabit(habitId: HabitId, name: string): Promise<void> {
  const { error } = await getSupabaseClient()
    .from("habits")
    .update({ name })
    .eq("id", habitId);

  if (error) throw error;
}

/**
 * Deletes a habit and, through the `on delete cascade` foreign key, every log
 * ever recorded for it. There is no undo — the UI asks for confirmation first.
 */
export async function deleteHabit(habitId: HabitId): Promise<void> {
  const { error } = await getSupabaseClient().from("habits").delete().eq("id", habitId);

  if (error) throw error;
}

/**
 * Trims a typed habit name and caps its length, or returns `null` when nothing
 * usable was typed.
 */
export function normaliseHabitName(name: string): string | null {
  const trimmed = name.trim().slice(0, HABIT_NAME_MAX_LENGTH);
  return trimmed.length > 0 ? trimmed : null;
}

function toHabit(row: {
  id: string;
  name: string;
  icon: string | null;
  active: boolean;
  sort_order: number;
  created_at: string;
}): Habit {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    active: row.active,
    sortOrder: row.sort_order,
    // `created_at` is a timestamptz; the analysis only ever needs its day.
    createdAt: toDateKey(new Date(row.created_at)),
  };
}
