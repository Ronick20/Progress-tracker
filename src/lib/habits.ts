import type { Habit } from "@/types/habit";

/**
 * The habits the tracker starts with. Ids are what gets persisted, so a `name`
 * can be reworded, and rows added or removed, without losing existing history.
 */
export const DEFAULT_HABITS: Habit[] = [
  { id: "wake-up-05", name: "Wake up at 05:00" },
  { id: "gym", name: "Gym" },
  { id: "reading", name: "Reading / Learning" },
  { id: "day-planning", name: "Day Planning" },
  { id: "no-grooming", name: "No Grooming" },
  { id: "project-work", name: "Project Work" },
  { id: "no-alcohol", name: "No Alcohol" },
  { id: "social-media-detox", name: "Social Media Detox" },
  { id: "goal-journaling", name: "Goal Journaling" },
  { id: "cold-shower", name: "Cold Shower" },
  { id: "ten-k-steps", name: "10K Steps" },
  { id: "plan-tomorrow", name: "Plan Tomorrow" },
];
