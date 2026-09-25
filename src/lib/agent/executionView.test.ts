import { describe, expect, it } from "vitest";
import {
  appendDelta,
  deriveExecutionStatus,
  humanizeExecutionEvent,
  mergeStreamingText,
  pendingPermission,
  pendingQuestion,
  selectChangeEvents,
  selectTerminalEvents,
} from "./executionView";
import type { OpenCodeAgentEvent } from "./openCodeTypes";

function evt(
  type: OpenCodeAgentEvent["type"],
  payload: Record<string, unknown> = {},
  timestamp = "2026-01-01T00:00:00.000Z",
  eventId = `e_${Math.random().toString(36).slice(2)}`,
): OpenCodeAgentEvent {
  return { eventId, taskId: "otask_1", sessionId: "osess_1", timestamp, type, payload };
}

describe("deriveExecutionStatus", () => {
  it("reports idle without a task", () => {
    expect(deriveExecutionStatus(undefined, []).status).toBe("idle");
  });

  it("maps terminal activity to terminal_running with command", () => {
    const s = deriveExecutionStatus({ status: "RUNNING" }, [
      evt("agent.terminal.started", { command: "npm run build" }),
    ]);
    expect(s.status).toBe("terminal_running");
    expect(s.activeCommand).toBe("npm run build");
    expect(s.headline).toContain("npm");
  });

  it("maps bash tool calls to terminal_running", () => {
    const s = deriveExecutionStatus({ status: "RUNNING" }, [
      evt("agent.tool.started", { tool: "bash", callId: "c1", input: { command: "npm test" } }),
    ]);
    expect(s.status).toBe("terminal_running");
    expect(s.detail).toBe("npm test");
  });

  it("maps file edits to editing", () => {
    const s = deriveExecutionStatus({ status: "RUNNING" }, [
      evt("agent.tool.started", { tool: "edit", input: { filePath: "src/a.ts" } }),
    ]);
    expect(s.status).toBe("editing");
    expect(s.headline).toContain("src/a.ts");
  });

  it("distinguishes permission waits from question waits", () => {
    const perm = deriveExecutionStatus(
      { status: "WAITING_FOR_PERMISSION", waitingKind: "permission" },
      [evt("agent.permission.requested", { description: "OpenCode wants to edit — a.ts", serverAction: "edit" })],
    );
    expect(perm.status).toBe("waiting_permission");
    expect(perm.headline).toBe("Waiting for permission");

    const q = deriveExecutionStatus(
      { status: "WAITING_FOR_PERMISSION", waitingKind: "question" },
      [evt("agent.question.requested", { questions: [{ header: "DB", question: "Which?", options: [] }] })],
    );
    expect(q.status).toBe("waiting_user");
    expect(q.headline).toBe("Waiting for your input");
    expect(q.detail).toBe("Which?");
  });

  it("resolves waits after replies", () => {
    expect(
      pendingPermission([
        evt("agent.permission.requested", {}, "2026-01-01T00:00:00.000Z"),
        evt("agent.permission.replied", {}, "2026-01-01T00:00:01.000Z"),
      ]),
    ).toBeUndefined();
    expect(
      pendingQuestion([evt("agent.question.requested", { questions: [] })]),
    ).toBeDefined();
  });

  it("completed tool calls clear the active tool", () => {
    const s = deriveExecutionStatus({ status: "RUNNING" }, [
      evt("agent.tool.started", { tool: "read", input: { filePath: "a" } }, "2026-01-01T00:00:00.000Z"),
      evt("agent.tool.completed", { callId: "c" }, "2026-01-01T00:00:01.000Z"),
    ]);
    expect(s.status).not.toBe("editing");
    expect(s.activeTool).toBeUndefined();
  });

  it("surfaces todos + context", () => {
    const s = deriveExecutionStatus({ status: "RUNNING" }, [
      evt("agent.todo.updated", { todos: [{ content: "Build it", status: "in_progress", priority: "high" }] }),
      evt("agent.context.updated", { input: 1000, output: 200 }),
    ]);
    expect(s.todos?.[0].content).toBe("Build it");
    expect(s.context?.input).toBe(1000);
  });
});

describe("selectors + humanizer", () => {
  const events = [
    evt("agent.terminal.started", { command: "npm test" }),
    evt("agent.file.changed", { file: "a.ts" }),
    evt("agent.error", { message: "boom" }),
    evt("agent.tool.started", { tool: "bash" }),
  ];
  it("selects terminal + change events", () => {
    expect(selectTerminalEvents(events).length).toBe(1);
    expect(selectChangeEvents(events).length).toBe(1);
  });
  it("humanizes new types", () => {
    expect(humanizeExecutionEvent(evt("agent.terminal.started", { command: "npm test" }))).toContain("npm test");
    expect(humanizeExecutionEvent(evt("agent.question.requested", { questions: [{ header: "H", question: "Q?" }] }))).toContain("Q?");
    expect(humanizeExecutionEvent(evt("agent.todo.updated", { todos: [{ content: "x", status: "pending", priority: "low" }] }))).toContain("planned");
  });
  it("caps streaming accumulation", () => {
    expect(appendDelta("a", "b")).toBe("ab");
    expect(appendDelta("x".repeat(100), "y", 10).length).toBeLessThanOrEqual(10);
  });
  it("heals snapshots without duplicating streamed text", () => {
    expect(mergeStreamingText("Hello ", "Hello world")).toBe("Hello world");
    expect(mergeStreamingText("Hello world", "Hello world")).toBe("Hello world");
    expect(mergeStreamingText("abcXYZ", "XYZdef")).toBe("abcXYZdef");
    expect(mergeStreamingText("", "full")).toBe("full");
    expect(mergeStreamingText("keep", "")).toBe("keep");
  });
});
