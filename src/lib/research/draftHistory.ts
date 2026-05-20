/**
 * In-memory undo/redo stack for draft edits (desktop also persists via IPC history).
 */

export type DraftHistoryState = {
  past: string[];
  present: string;
  future: string[];
};

export function createDraftHistory(initial: string): DraftHistoryState {
  return { past: [], present: initial, future: [] };
}

export function pushDraft(state: DraftHistoryState, next: string, maxDepth = 100): DraftHistoryState {
  if (next === state.present) return state;
  const past = [...state.past, state.present].slice(-maxDepth);
  return { past, present: next, future: [] };
}

export function undoDraft(state: DraftHistoryState): DraftHistoryState | null {
  if (state.past.length === 0) return null;
  const previous = state.past[state.past.length - 1];
  const past = state.past.slice(0, -1);
  const future = [state.present, ...state.future];
  return { past, present: previous, future };
}

export function redoDraft(state: DraftHistoryState): DraftHistoryState | null {
  if (state.future.length === 0) return null;
  const [next, ...rest] = state.future;
  const past = [...state.past, state.present];
  return { past, present: next, future: rest };
}

export function canUndo(state: DraftHistoryState): boolean {
  return state.past.length > 0;
}

export function canRedo(state: DraftHistoryState): boolean {
  return state.future.length > 0;
}
