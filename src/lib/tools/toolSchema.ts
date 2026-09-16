/**
 * Phase 5 — Schema validation facade (typed wrapper over toolCore.mjs).
 * Schemas are defined by registered tools; callers never supply schemas.
 */
import { validateAgainstSchema } from "@/lib/tools/toolCore.mjs";
import { ToolError } from "@/lib/tools/toolErrors";
import type { ObjectSchema } from "@/lib/tools/toolTypes";

export function validateToolInput(schema: ObjectSchema, input: unknown, toolId: string): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ToolError("invalid_input", toolId);
  }
  const res = validateAgainstSchema(schema, input) as
    | { ok: true; value: Record<string, unknown> }
    | { ok: false; error: string };
  if (!res.ok) {
    const tooLarge = /exceed/i.test(res.error);
    throw new ToolError(tooLarge ? "input_too_large" : "invalid_input", res.error.slice(0, 200));
  }
  return res.value;
}

export function validateToolOutput(schema: ObjectSchema, output: unknown, toolId: string): Record<string, unknown> {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    throw new ToolError("invalid_output", toolId);
  }
  const res = validateAgainstSchema(schema, output) as
    | { ok: true; value: Record<string, unknown> }
    | { ok: false; error: string };
  if (!res.ok) throw new ToolError("invalid_output", res.error.slice(0, 200));
  return res.value;
}
