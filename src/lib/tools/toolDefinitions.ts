/**
 * Phase 5 — Static tool definitions (typed view over the shared
 * toolCore.mjs single source of truth, used by both renderer and Electron).
 */
import { TOOL_DEFINITIONS as CORE } from "@/lib/tools/toolCore.mjs";
import type { ToolDefinition } from "@/lib/tools/toolTypes";

export const TOOL_DEFINITIONS: ToolDefinition[] = CORE as unknown as ToolDefinition[];
