import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { closeDb, getDb } from "./researchDb.mjs";
import { makeTempUserData } from "./test/researchTestApp.mjs";
import {
  appendTaskEvent,
  getRuntimeMeta,
  getTask,
  getTaskEvents,
  listTasks,
  reconcileInterruptedTasks,
  saveRuntimeMeta,
  saveSession,
  saveTask,
} from "./taskStore.mjs";

function sampleTask(id, status = "RUNNING") {
  return {
    id,
    title: "t",
    prompt: "Inspect this project and fix the failing tests.",
    category: "CODE",
    mode: "build",
    workspace: { workspaceId: "ws1", rootPath: "/tmp/ws", displayName: "ws" },
    sessionId: "osess_1",
    status,
    provider: "omniroute",
    model: "auto",
    providerStatus: "AVAILABLE",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe("taskStore Phase 2 (durable execution state)", () => {
  let ctx;
  let app;

  beforeEach(async () => {
    ctx = await makeTempUserData();
    app = ctx.app;
    closeDb();
    getDb(app);
  });

  afterEach(async () => {
    closeDb();
    await ctx.cleanup();
  });

  it("persists and retrieves tasks", async () => {
    saveTask(app, sampleTask("otask_a", "RUNNING"));
    const got = getTask(app, "otask_a");
    assert.equal(got.status, "RUNNING");
    assert.equal(got.provider, "omniroute");
    assert.ok(listTasks(app).some((t) => t.id === "otask_a"));
  });

  it("persists sessions + runtime meta", async () => {
    saveSession(app, { id: "osess_1", workspaceId: "ws1", taskId: "otask_a", status: "RUNNING", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    saveRuntimeMeta(app, "omniroute:last", { status: "READY" });
    assert.deepEqual(getRuntimeMeta(app, "omniroute:last"), { status: "READY" });
  });

  it("bounds events per task (no unbounded growth)", async () => {
    saveTask(app, sampleTask("otask_evict", "RUNNING"));
    for (let i = 0; i < 560; i++) {
      appendTaskEvent(app, {
        eventId: `aevt_evict_${i}`,
        taskId: "otask_evict",
        sessionId: "s",
        type: "agent.tool.output",
        payload: { message: `line ${i}` },
        timestamp: new Date().toISOString(),
      });
    }
    const events = getTaskEvents(app, "otask_evict");
    assert.ok(events.length <= 500);
  });

  it("reconciles interrupted tasks to UNKNOWN (never completed)", async () => {
    saveTask(app, sampleTask("otask_running", "RUNNING"));
    saveTask(app, sampleTask("otask_waiting", "WAITING_FOR_PERMISSION"));
    saveTask(app, sampleTask("otask_done", "COMPLETED"));
    const n = reconcileInterruptedTasks(app);
    assert.equal(n, 2);
    assert.equal(getTask(app, "otask_running").status, "UNKNOWN");
    assert.equal(getTask(app, "otask_waiting").status, "UNKNOWN");
    assert.equal(getTask(app, "otask_done").status, "COMPLETED");
    const events = getTaskEvents(app, "otask_running");
    assert.ok(events.some((e) => e.type === "agent.failed"));
  });

  it("redacts secrets from persisted payloads", async () => {
    saveTask(app, sampleTask("otask_redact", "RUNNING"));
    appendTaskEvent(app, {
      eventId: "aevt_secret_1",
      taskId: "otask_redact",
      sessionId: "s",
      type: "agent.tool.output",
      payload: { message: "api_key=supersecret123" },
      timestamp: new Date().toISOString(),
    });
    const events = getTaskEvents(app, "otask_redact");
    assert.ok(!JSON.stringify(events).includes("supersecret123"));
  });
});
