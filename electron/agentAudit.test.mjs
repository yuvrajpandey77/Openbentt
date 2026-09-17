import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { closeDb } from "./researchDb.mjs";
import { listToolAuditEvents } from "./toolStore.mjs";
import { registerResearchProjectIpc } from "./researchProjectService.mjs";
import { makeTempUserData } from "./test/researchTestApp.mjs";

function mockIpcMain() {
  const handlers = new Map();
  return {
    handle(channel, fn) { handlers.set(channel, fn); },
    async invoke(channel, ...args) {
      const fn = handlers.get(channel);
      if (!fn) throw new Error(`No IPC handler: ${channel}`);
      return fn({}, ...args);
    },
  };
}

describe("agent audit record IPC (Phase 6 run events reuse Phase 5 ledger)", () => {
  let ctx;
  let app;
  let ipc;

  beforeEach(async () => {
    ctx = await makeTempUserData();
    app = ctx.app;
    closeDb();
    ipc = mockIpcMain();
    registerResearchProjectIpc(ipc, app);
  });

  afterEach(async () => {
    closeDb();
    await ctx.cleanup();
  });

  it("record persists agent.run events; allowlist otherwise intact", async () => {
    const id = await ipc.invoke("research:tools", "record", {
      event: {
        eventId: "aevt_agent1", toolId: "agent.run", toolVersion: "1",
        requestId: "areq_1", timestamp: new Date().toISOString(), source: "agent",
        projectId: "proj_1", permission: "READ_ONLY", risk: "LOW",
        decision: "ALLOW", status: "ok", durationMs: 42,
        resourceSummary: { agentId: "research-assistant", runId: "arun_1", phase: "run_finish" },
      },
    });
    assert.equal(id, "aevt_agent1");
    const listed = await ipc.invoke("research:tools", "audit", { toolId: "agent.run" });
    assert.equal(listed.length, 1);
    assert.equal(listed[0].requestId, "areq_1");
    // Renderer cannot bypass policy: record stores only, never executes.
    const tools = await ipc.invoke("research:tools", "list");
    assert.ok(tools.length >= 15);
    assert.ok(!tools.some((t) => t.id === "agent.run"));
    const denied = await ipc.invoke("research:tools", "execute", {
      toolId: "agent.run", input: {}, context: {},
    });
    assert.equal(denied.ok, false);
    assert.equal(denied.errorKind, "unknown_tool");
    // Direct store parity (record + the audited denial above).
    const stored = listToolAuditEvents(app, { toolId: "agent.run" });
    assert.equal(stored.length, 2);
    assert.ok(stored.some((e) => e.requestId === "areq_1"));
  });
});
