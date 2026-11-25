/** Recent OpenCode workspace folders (local-only). */
const KEY = "openbentt-workspace-history";
const MAX = 8;

export function loadWorkspaceHistory(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
      .map((p) => p.trim())
      .slice(0, MAX);
  } catch {
    return [];
  }
}

export function rememberWorkspacePath(path: string): string[] {
  const v = path.trim();
  if (!v) return loadWorkspaceHistory();
  const next = [v, ...loadWorkspaceHistory().filter((p) => p !== v)].slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}
