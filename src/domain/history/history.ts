import type { Patch } from 'immer';

/** One undoable step: forward patches and their inverse. */
export interface HistoryEntry {
  label: string;
  patches: Patch[];
  inverse: Patch[];
}

export interface History {
  past: HistoryEntry[];
  future: HistoryEntry[];
}

export const MAX_HISTORY = 500;

export const emptyHistory = (): History => ({ past: [], future: [] });

/** Records a new step; any redo branch is discarded. */
export function record(history: History, entry: HistoryEntry): History {
  if (entry.patches.length === 0) return history;
  return { past: [...history.past, entry].slice(-MAX_HISTORY), future: [] };
}

/** Combines two consecutive steps into one (e.g. every move of a single drag). */
export function merge(first: HistoryEntry, second: HistoryEntry): HistoryEntry {
  return {
    label: first.label,
    patches: [...first.patches, ...second.patches],
    inverse: [...second.inverse, ...first.inverse],
  };
}

export function takeUndo(history: History): { entry: HistoryEntry; history: History } | null {
  const entry = history.past[history.past.length - 1];
  if (!entry) return null;
  return { entry, history: { past: history.past.slice(0, -1), future: [...history.future, entry] } };
}

export function takeRedo(history: History): { entry: HistoryEntry; history: History } | null {
  const entry = history.future[history.future.length - 1];
  if (!entry) return null;
  return { entry, history: { past: [...history.past, entry], future: history.future.slice(0, -1) } };
}
