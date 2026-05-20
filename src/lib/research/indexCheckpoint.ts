const CHECKPOINT_PREFIX = "openbentt-index-checkpoint-";

export type IndexCheckpoint = {
  projectId: string;
  vectors: Record<string, number[]>;
  doneIds: string[];
  total: number;
  updatedAt: string;
};

export function checkpointKey(projectId: string): string {
  return `${CHECKPOINT_PREFIX}${projectId}`;
}

export function loadIndexCheckpoint(projectId: string): IndexCheckpoint | null {
  try {
    const raw = localStorage.getItem(checkpointKey(projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as IndexCheckpoint;
    if (parsed.projectId !== projectId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveIndexCheckpoint(cp: IndexCheckpoint): void {
  try {
    localStorage.setItem(checkpointKey(cp.projectId), JSON.stringify(cp));
  } catch {
    /* quota — caller may trim */
  }
}

export function clearIndexCheckpoint(projectId: string): void {
  localStorage.removeItem(checkpointKey(projectId));
}
