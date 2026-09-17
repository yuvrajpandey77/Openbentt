/**
 * Phase 5 — Schema validation facade (typed wrapper over toolCore.mjs).
 * Schemas are defined by registered tools; callers never supply schemas.
 */
import { validateAgainstSchema } from "@/lib/tools/toolCore.mjs";
import { ToolError } from "@/lib/tools/toolErrors";
import type { ObjectSchema } from "@/lib/tools/toolTypes";

interface CoreResult {
  ok: boolean;
  value?: Record<string, unknown>;
  error?: string;
}

function runValidation(schema: ObjectSchema, value: object): CoreResult {
  return validateAgainstSchema(schema, value) as CoreResult;
}

export function validateToolInput(schema: ObjectSchema, input: unknown, toolId: string): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ToolError("invalid_input", toolId);
  }
  const res = runValidation(schema, input);
  if (!res.ok) {
    const msg = typeof res.error === "string" ? res.error : "invalid input";
    const tooLarge = /exceed/i.test(msg);
    throw new ToolError(tooLarge ? "input_too_large" : "invalid_input", msg.slice(0, 200));
  }
  return (res.value ?? {}) as Record<string, unknown>;
}

export function validateToolOutput(schema: ObjectSchema, output: unknown, toolId: string): Record<string, unknown> {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    throw new ToolError("invalid_output", toolId);
  }
  const res = runValidation(schema, output);
  if (!res.ok) {
    const msg = typeof res.error === "string" ? res.error : "invalid output";
    throw new ToolError("invalid_output", msg.slice(0, 200));
  }
  return (res.value ?? {}) as Record<string, unknown>;
}
