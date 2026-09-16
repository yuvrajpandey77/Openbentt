/**
 * Phase 5 — Web audit fallback (bounded localStorage, offline-first).
 * Clearly separated from Electron durable audit state; identical event
 * shape on both runtimes. Bounded: latest 2000 events.
 */
import { logger } from "@/lib/log";
import { TOOL_LIMITS } from "@/lib/tools/toolCore.mjs";
import type { ToolAuditEvent } from "@/lib/tools/toolTypes";

const KEY = "openbentt-tools-audit-v1";
const MAX = TOOL_LIMITS.maxAuditEvents as number;

function load(): ToolAuditEvent[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ToolAuditEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(events: ToolAuditEvent[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(events.slice(0, MAX)));
  } catch {
    logger.warn("tools", "web audit persist failed (quota?)");
  }
}

export const toolAuditWebStore = {
  record(event: ToolAuditEvent): void {
    const events = load();
    events.unshift(event);
    save(events.slice(0, MAX));
  },
  list(opts?: { toolId?: string; projectId?: string; status?: string; limit?: number }): ToolAuditEvent[] {
    const limit = Math.min(Math.max(Number(opts?.limit ?? 50), 1), 200);
    return load()
      .filter((e) => (!opts?.toolId || e.toolId === opts.toolId)
        && (!opts?.projectId || e.projectId === opts.projectId)
        && (!opts?.status || e.status === opts.status))
      .slice(0, limit);
  },
  clearForTest(): void {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  },
};
