import { useSyncExternalStore } from "react";

import type { CompletionMap } from "@/types/habit";

const STORAGE_KEY = "habit-tracker.completions.v1";
const STORAGE_VERSION = 1;

interface StoredPayload {
  version: number;
  completions: CompletionMap;
}

/**
 * Completions live in localStorage and are exposed to React as an external
 * store. The in-memory `cache` is the snapshot React reads, so it must only
 * ever be replaced (never mutated) when the data changes.
 */
let cache: CompletionMap | null = null;
const listeners = new Set<() => void>();
const EMPTY_COMPLETIONS: CompletionMap = {};

/** Subscribe to completions, and keep other tabs of the app in sync. */
export function useCompletions(): CompletionMap {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Applies an update, persists it, and notifies every subscriber. */
export function updateCompletions(
  updater: (previous: CompletionMap) => CompletionMap,
): void {
  cache = updater(getSnapshot());
  writeToStorage(cache);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", handleExternalChange);

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener("storage", handleExternalChange);
    }
  };
}

function getSnapshot(): CompletionMap {
  cache ??= readFromStorage();
  return cache;
}

function getServerSnapshot(): CompletionMap {
  return EMPTY_COMPLETIONS;
}

/** Another tab changed the data (a cleared storage area reports `key: null`). */
function handleExternalChange(event: StorageEvent): void {
  if (event.key !== null && event.key !== STORAGE_KEY) return;

  cache = readFromStorage();
  listeners.forEach((listener) => listener());
}

/**
 * Any missing, malformed or outdated payload is treated as "no data yet"
 * rather than an error, so a corrupted entry can never block the tracker.
 */
function readFromStorage(): CompletionMap {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_COMPLETIONS;

    const parsed: unknown = JSON.parse(raw);
    if (!isStoredPayload(parsed) || parsed.version !== STORAGE_VERSION) {
      return EMPTY_COMPLETIONS;
    }

    return parsed.completions;
  } catch {
    return EMPTY_COMPLETIONS;
  }
}

function writeToStorage(completions: CompletionMap): void {
  try {
    const payload: StoredPayload = { version: STORAGE_VERSION, completions };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Storage can be full or disabled (private browsing); the in-memory state
    // stays correct for this session either way.
  }
}

function isStoredPayload(value: unknown): value is StoredPayload {
  if (typeof value !== "object" || value === null) return false;

  const candidate = value as Partial<StoredPayload>;
  return (
    typeof candidate.version === "number" &&
    typeof candidate.completions === "object" &&
    candidate.completions !== null
  );
}
