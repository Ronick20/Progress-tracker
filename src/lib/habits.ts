import { getSupabaseClient } from "@/lib/supabase";
import type { Habit } from "@/types/habit";

/**
 * Every active habit, in the order they should appear as grid rows.
 *
 * This is the only source of habits — there is no hardcoded list in the UI.
 * Habits are added, renamed, reordered or deactivated in the Supabase
 * dashboard, and the change shows up on every device on next load.
 */
export async function fetchHabits(): Promise<Habit[]> {
  const { data, error } = await getSupabaseClient()
    .from("habits")
    .select("id, name, icon, active, sort_order")
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    icon: row.icon,
    active: row.active,
    sortOrder: row.sort_order,
  }));
}
