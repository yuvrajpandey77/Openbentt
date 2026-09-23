/**
 * Canonical execution runtime configuration.
 *
 * OpenCode is the DEFAULT (and currently only) execution engine.
 * Model/provider selection (which AI reasons) and execution runtime
 * (which system acts) are different concepts — keep them separate in UI.
 *
 * Renderer must never know about CLI processes, stdin/stdout,
 * child_process, or OpenCode flags. It knows: Task, Conversation,
 * Activity, Permission, Result. CLI details stay in
 * electron/opencodeService.mjs (or the OpenCode adapter).
 */

export const EXECUTION_RUNTIME = "opencode" as const;

export type ExecutionRuntime = typeof EXECUTION_RUNTIME;

export const EXECUTION_LABEL: Record<ExecutionRuntime, string> = {
  opencode: "OpenCode",
};

export function executionDisplayLabel(runtime: string = EXECUTION_RUNTIME): string {
  return (EXECUTION_LABEL as Record<string, string>)[runtime] ?? runtime;
}

const STORAGE_KEY = "openbentt-execution-runtime";

export function getExecutionRuntime(): ExecutionRuntime {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "opencode") return "opencode";
  } catch {
    /* ignore */
  }
  return EXECUTION_RUNTIME;
}

export function setExecutionRuntime(v: ExecutionRuntime): void {
  try {
    localStorage.setItem(STORAGE_KEY, v);
  } catch {
    /* ignore */
  }
}
