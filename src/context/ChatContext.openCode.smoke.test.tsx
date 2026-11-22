/**
 * Smoke coverage for Chat → OpenCode routing (mocked desktop bridge).
 * Full ChatProvider mount is heavy; this exercises decideRoute + API seam contracts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { decideRoute } from "@/lib/agent/openCodeHarness";

const createTask = vi.fn();
const startTask = vi.fn();
const onEvent = vi.fn(() => () => {});

vi.mock("@/lib/agent/openCodeAgentApi", () => ({
  hasOpenCodeDesktopApi: () => true,
  openCodeAgentApi: {
    createTask: (...args: unknown[]) => createTask(...args),
    startTask: (...args: unknown[]) => startTask(...args),
    onEvent: (...args: unknown[]) => onEvent(...args),
    detectOpenCode: async () => ({ installed: true, version: "test" }),
    getRuntimeStatus: async () => ({
      omniRoute: { status: "READY", baseUrl: "http://127.0.0.1:9" },
    }),
    getModels: async () => ({ models: [{ id: "auto", displayName: "Auto", available: true }] }),
    ensureRuntime: async () => ({}),
  },
}));

describe("ChatContext OpenCode smoke (seam)", () => {
  beforeEach(() => {
    createTask.mockReset();
    startTask.mockReset();
    onEvent.mockClear();
    createTask.mockResolvedValue({
      task: { id: "task-1", status: "QUEUED" },
    });
    startTask.mockResolvedValue({ ok: true });
  });

  it("plan/build prompts decide to route to OpenCode", () => {
    const plan = decideRoute("Analyze this repo and propose a plan");
    expect(plan.routeToOpenCode).toBe(true);
    expect(plan.mode).toBe("plan");

    const build = decideRoute("Fix the failing tests in this project");
    expect(build.routeToOpenCode).toBe(true);
    expect(build.mode).toBe("build");
  });

  it("createTask + startTask succeed for a routed turn", async () => {
    const { openCodeAgentApi } = await import("@/lib/agent/openCodeAgentApi");
    const created = await openCodeAgentApi.createTask({
      prompt: "Fix the failing tests",
      title: "Fix the failing tests",
      workspaceRoot: "/tmp/ws",
      mode: "build",
    });
    expect(created.task.id).toBe("task-1");
    await openCodeAgentApi.startTask(created.task.id);
    expect(startTask).toHaveBeenCalledWith("task-1");
  });

  it("failed createTask surfaces as Error for callers to mark executionStatus failed", async () => {
    createTask.mockRejectedValueOnce(new Error("IPC bridge down"));
    const { openCodeAgentApi } = await import("@/lib/agent/openCodeAgentApi");
    await expect(
      openCodeAgentApi.createTask({
        prompt: "x",
        title: "x",
        workspaceRoot: "/tmp",
        mode: "plan",
      })
    ).rejects.toThrow(/IPC bridge down/);
  });

  it("onEvent registration returns a dispose function", async () => {
    const { openCodeAgentApi } = await import("@/lib/agent/openCodeAgentApi");
    const dispose = openCodeAgentApi.onEvent(() => {});
    expect(typeof dispose).toBe("function");
    expect(onEvent).toHaveBeenCalled();
  });
});
