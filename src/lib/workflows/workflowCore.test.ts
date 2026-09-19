/**
 * Phase 8 — workflow core tests: validation + deterministic conditions.
 */
import { describe, it, expect } from "vitest";
import {
  evaluateCondition,
  isTerminalRunStatus,
  validateStep,
  validateTrigger,
  validateWorkflow,
} from "@/lib/workflows/workflowCore.mjs";

describe("workflow validation", () => {
  it("accepts a minimal manual workflow", () => {
    expect(validateWorkflow({
      name: "Triage",
      trigger: { kind: "manual" },
      steps: [{ kind: "tool_call", toolId: "knowledge.search", input: {} }],
    })).toBe(null);
  });
  it("rejects bad names, triggers, steps", () => {
    expect(validateWorkflow({ name: "", trigger: { kind: "manual" }, steps: [] })).not.toBe(null);
    expect(validateWorkflow({
      name: "x", trigger: { kind: "cron" }, steps: [{ kind: "tool_call", toolId: "t" }],
    })).not.toBe(null);
    expect(validateWorkflow({
      name: "x", trigger: { kind: "schedule", intervalMinutes: 1 },
      steps: [{ kind: "tool_call", toolId: "t" }],
    })).not.toBe(null);
    expect(validateWorkflow({
      name: "x", trigger: { kind: "sync_completed" }, steps: [{ kind: "tool_call", toolId: "t" }],
    })).not.toBe(null);
    expect(validateTrigger({ kind: "sync_completed", connectorId: "gmail" })).toBe(null);
    expect(validateStep({ kind: "launch-missiles" }, 0)).not.toBe(null);
    expect(validateStep({ kind: "tool_call" }, 0)).not.toBe(null);
  });
});

describe("condition evaluation", () => {
  const state = { status: "synced", counts: { imported: 3, failed: 0 } };
  it("evaluates comparisons over state fields", () => {
    expect(evaluateCondition("counts.imported > 0", state)).toBe(true);
    expect(evaluateCondition("counts.failed == 0", state)).toBe(true);
    expect(evaluateCondition("status == synced", state)).toBe(true);
    expect(evaluateCondition("counts.imported > 10", state)).toBe(false);
    expect(evaluateCondition("status != synced", state)).toBe(false);
  });
  it("fails closed on anything else", () => {
    expect(evaluateCondition("process.exit()", state)).toBe(false);
    expect(evaluateCondition("__proto__ == x", state)).toBe(false);
    expect(evaluateCondition("counts.imported", state)).toBe(false);
    expect(evaluateCondition("", state)).toBe(false);
  });
  it("classifies terminal statuses", () => {
    expect(isTerminalRunStatus("completed")).toBe(true);
    expect(isTerminalRunStatus("running")).toBe(false);
    expect(isTerminalRunStatus("awaiting_approval")).toBe(false);
  });
});
