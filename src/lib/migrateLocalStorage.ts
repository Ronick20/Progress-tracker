import { upsertCompletions } from "@/lib/habitLogs";
import type { DateKey, Habit, HabitId } from "@/types/habit";

const LEGACY_STORAGE_KEY = "habit-tracker.completions.v1";
const MIGRATION_DONE_KEY = "habit-tracker.migrated-to-supabase.v1";

/**
 * Phase 1 identified habits by hand-written slugs; Phase 2 uses the UUIDs
 * PostgreSQL generates. The two are bridged by name, which is the only thing
 * the old and new records have in common.
 */
const LEGACY_SLUG_TO_NAME: Record<string, string> = {
  "wake-up-05": "Wake up at 05:00",
  gym: "Gym",
  reading: "Reading / Learning",
  "day-planning": "Day Planning",
  "no-grooming": "No Grooming",
  "project-work": "Project Work",
  "no-alcohol": "No Alcohol",
  "social-media-detox": "Social Media Detox",
  "goal-journaling": "Goal Journaling",
  "cold-shower": "Cold Shower",
  "ten-k-steps": "10K Steps",
  "plan-tomorrow": "Plan Tomorrow",
};

/**
 * Copies any Phase 1 localStorage completions into Supabase, once.
 *
 * A marker key records that the migration ran, so it never repeats. Even if it
 * did, every write is an upsert on `(habit_id, date)`, so re-running could not
 * create duplicates. The legacy entry is left in place rather than deleted, so
 * nothing is destroyed if the upload only partly succeeds; Supabase is the
 * source of truth from this point on and the old entry is never read again.
 *
 * Returns the number of completions uploaded, or `0` if there was nothing to do.
 */
export async function migrateLegacyCompletions(habits: Habit[]): Promise<number> {
  if (typeof window === "undefined") return 0;
  if (readFlag(MIGRATION_DONE_KEY)) return 0;

  const legacy = readLegacyCompletions();
  const idByName = new Map(habits.map((habit) => [habit.name, habit.id]));

  const rows: { habitId: HabitId; date: DateKey; completed: boolean }[] = [];

  for (const [date, completedHabits] of Object.entries(legacy)) {
    for (const slug of Object.keys(completedHabits ?? {})) {
      const habitId = idByName.get(LEGACY_SLUG_TO_NAME[slug] ?? slug);
      // A habit that no longer exists in the database is skipped rather than
      // failing the whole migration on a foreign key error.
      if (habitId) rows.push({ habitId, date, completed: true });
    }
  }

  await upsertCompletions(rows);
  writeFlag(MIGRATION_DONE_KEY);

  return rows.length;
}

type LegacyCompletions = Record<string, Record<string, true> | undefined>;

/** Any missing or malformed payload simply means "nothing to migrate". */
function readLegacyCompletions(): LegacyCompletions {
  try {
    const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return {};

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};

    const completions = (parsed as { completions?: unknown }).completions;
    if (typeof completions !== "object" || completions === null) return {};

    return completions as LegacyCompletions;
  } catch {
    return {};
  }
}

function readFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) !== null;
  } catch {
    // Storage disabled (private browsing). Treat it as "already migrated":
    // there is no legacy data to read in that case either.
    return true;
  }
}

function writeFlag(key: string): void {
  try {
    window.localStorage.setItem(key, new Date().toISOString());
  } catch {
    // If the flag cannot be stored the migration may run again on next load,
    // which the upserts make harmless.
  }
}
