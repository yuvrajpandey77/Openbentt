/**
 * Process-wide counters for in-flight background work.
 * Leaving a route must not tear down WASM/workers while these are > 0.
 */

export type BackgroundWorkKind = "compile" | "paper" | "install" | "agent" | "index";

const counts: Record<BackgroundWorkKind, number> = {
  compile: 0,
  paper: 0,
  install: 0,
  agent: 0,
  index: 0,
};

const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) {
    try {
      l();
    } catch {
      /* ignore */
    }
  }
}

export function beginBackgroundWork(kind: BackgroundWorkKind): () => void {
  counts[kind] += 1;
  notify();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    counts[kind] = Math.max(0, counts[kind] - 1);
    notify();
  };
}

export function backgroundWorkCount(kind?: BackgroundWorkKind): number {
  if (kind) return counts[kind];
  return Object.values(counts).reduce((a, b) => a + b, 0);
}

export function hasActiveBackgroundWork(kinds?: BackgroundWorkKind[]): boolean {
  if (!kinds?.length) return backgroundWorkCount() > 0;
  return kinds.some((k) => counts[k] > 0);
}

export function subscribeBackgroundWork(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
