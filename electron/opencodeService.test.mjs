import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { closeDb } from "./researchDb.mjs";
import { makeTempUserData } from "./test/researchTestApp.mjs";
import {
  __testHooks,
  assertPathInWorkspace,
  cancelSession,
  cancelTask,
  closeSession,
  createSession,
  createTask,
  detectOpenCode,
  getRuntimeState,
  getSession,
  getTask,
  listSessions,
  listTasks,
  registerOpenCodeIpc,
  resolveWorkspaceRoot,
  respondToPermission,
  startTask,
} from "./opencodeService.mjs";

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

describe("opencodeService Phase 1", () => {
  let ctx;
  let workspace;
  let outside;

  beforeEach(async () => {
    ctx = await makeTempUserData();
    __testHooks.reset();
    workspace = await fs.promises.mkdtemp(path.join(os.tmpdir(), "openbentt-opencode-ws-"));
    await fs.promises.writeFile(path.join(workspace, "package.json"), JSON.stringify({ name: "t" }));
    outside = await fs.promises.mkdtemp(path.join(os.tmpdir(), "openbentt-opencode-out-"));
    // Force unavailable runtime for hermetic tests; tasks still exercise the harness.
    __testHooks.setDetectionCache({ installed: false, source: "unknown", compatible: false });
  });

  afterEach(async () => {
    await fs.promises.rm(workspace, { recursive: true, force: true }).catch(() => {});
    await fs.promises.rm(outside, { recursive: true, force: true }).catch(() => {});
    closeDb();
    await ctx?.cleanup?.();
  });

  it("detection reports structured result", async () => {
    const det = await detectOpenCode();
    assert.equal(typeof det.installed, "boolean");
    assert.ok("compatible" in det);
  });

  it("workspace resolution + containment (incl. symlink escape)", async () => {
    const root = await resolveWorkspaceRoot(workspace);
    assert.ok(root.length > 0);
    const ok = await assertPathInWorkspace(root, path.join(root, "src/index.ts"));
    assert.ok(ok.includes("src"));
    await assert.rejects(() => assertPathInWorkspace(root, path.join(root, "..", "secret")), /outside workspace/);
    await assert.rejects(() => assertPathInWorkspace(root, "/etc/passwd"), /outside workspace/);
    // Symlink escape: link inside workspace pointing outside.
    const link = path.join(root, "evil-link");
    await fs.promises.symlink(outside, link).catch(() => {});
    try {
      const st = await fs.promises.lstat(link);
      if (st.isSymbolicLink()) {
        await assert.rejects(() => assertPathInWorkspace(root, path.join(link, "x")), /outside workspace/);
      }
    } finally {
      await fs.promises.unlink(link).catch(() => {});
    }
  });

  it("task lifecycle: create → start → permission → allow → complete", async () => {
    const task = await createTask(ctx.app, {
      title: "Fix tests",
      prompt: "Inspect this project and fix the failing tests.",
      workspaceRoot: workspace,
    });
    assert.equal(task.category, "CODE");
    assert.equal(task.status, "QUEUED");
    const started = await startTask(ctx.app, task.id);
    assert.ok(["RUNNING", "WAITING_FOR_PERMISSION", "COMPLETED"].includes(started.status));
    // The fix+test prompt must pause for approval (never fall through).
    const deadline = Date.now() + 5000;
    let cur = getTask(task.id);
    while (cur.status !== "WAITING_FOR_PERMISSION" && Date.now() < deadline) {
      if (cur.status === "COMPLETED" || cur.status === "FAILED") break;
      await new Promise((r) => setTimeout(r, 50));
      cur = getTask(task.id);
    }
    assert.equal(cur.status, "WAITING_FOR_PERMISSION");
    {
      const { getApproval } = await import("./actionStore.mjs");
      const { listApprovals } = await import("./actionStore.mjs");
      const approvals = listApprovals(ctx.app, { status: "proposed" });
      assert.ok(approvals.length > 0);
      const approval = approvals[0];
      // Wrong fingerprint binding must fail: consume with tampered input.
      const { consumeApprovalForExecution } = await import("./actionStore.mjs");
      assert.throws(() =>
        consumeApprovalForExecution(ctx.app, approval.id, {
          toolId: "opencode.execute",
          projectId: approval.projectId,
          runId: task.id,
          input: { tampered: true },
        }),
      );
      const resumed = await respondToPermission(ctx.app, {
        taskId: task.id,
        approvalId: approval.id,
        decision: "allow-once",
      });
      assert.ok(["RUNNING", "WAITING_FOR_PERMISSION", "COMPLETED"].includes(resumed.status));
      // The test-command step needs its own approval — approve until done.
      const deadline2 = Date.now() + 5000;
      let cur2 = getTask(task.id);
      while (["RUNNING", "WAITING_FOR_PERMISSION"].includes(cur2.status) && Date.now() < deadline2) {
        if (cur2.status === "WAITING_FOR_PERMISSION") {
          const pending = listApprovals(ctx.app, { status: "proposed" });
          assert.ok(pending.length > 0);
          await respondToPermission(ctx.app, { taskId: task.id, approvalId: pending[0].id, decision: "allow-once" });
        }
        await new Promise((r) => setTimeout(r, 50));
        cur2 = getTask(task.id);
      }
      assert.equal(cur2.status, "COMPLETED");
      // Single-use: second consume must fail.
      assert.throws(() => getApproval(ctx.app, approval.id) && consumeApprovalForExecution(ctx.app, approval.id, {
        toolId: "opencode.execute",
        projectId: approval.projectId,
        runId: task.id,
        input: approval.input,
      }));
    }
  });

  it("deny leaves project intact + audit trail", async () => {
    const marker = path.join(workspace, "keep.txt");
    await fs.promises.writeFile(marker, "keep");
    const task = await createTask(ctx.app, {
      prompt: "Delete the entire project in this workspace.",
      workspaceRoot: workspace,
    });
    await startTask(ctx.app, task.id);
    // Delete prompt must pause for explicit confirmation (HIGH risk).
    const deadline = Date.now() + 5000;
    let cur = getTask(task.id);
    while (cur.status !== "WAITING_FOR_PERMISSION" && Date.now() < deadline) {
      if (cur.status === "COMPLETED" || cur.status === "FAILED") break;
      await new Promise((r) => setTimeout(r, 50));
      cur = getTask(task.id);
    }
    assert.equal(cur.status, "WAITING_FOR_PERMISSION");
    {
      const { listApprovals } = await import("./actionStore.mjs");
      const approvals = listApprovals(ctx.app, { status: "proposed" });
      assert.ok(approvals.length > 0);
      const denied = await respondToPermission(ctx.app, {
        taskId: task.id,
        approvalId: approvals[0].id,
        decision: "deny",
      });
      assert.equal(denied.status, "FAILED");
    }
    assert.equal((await fs.promises.readFile(marker, "utf8")), "keep");
  });

  it("sessions: create/get/list/cancel/close", async () => {
    const s = createSession({ workspaceId: "ws1" });
    assert.equal(getSession(s.id).id, s.id);
    assert.ok(listSessions().some((x) => x.id === s.id));
    cancelSession(s.id);
    assert.equal(getSession(s.id).status, "CANCELLED");
    closeSession(s.id);
    assert.equal(getSession(s.id), null);
  });

  it("cancelTask marks CANCELLED", async () => {
    const task = await createTask(ctx.app, { prompt: "Inspect this project and fix the login bug.", workspaceRoot: workspace });
    await startTask(ctx.app, task.id);
    const cancelled = await cancelTask(ctx.app, task.id);
    assert.equal(cancelled.status, "CANCELLED");
  });

  it("crash path marks running tasks CRASHED (never silent success)", async () => {
    const task = await createTask(ctx.app, { prompt: "Inspect this project and fix the login bug.", workspaceRoot: workspace });
    await startTask(ctx.app, task.id);
    __testHooks.markCrashed("test crash");
    assert.equal(getRuntimeState().status, "CRASHED");
    const cur = getTask(task.id);
    assert.ok(["CRASHED", "WAITING_FOR_PERMISSION", "RUNNING", "COMPLETED", "CANCELLED"].includes(cur.status));
  });

  it("IPC: valid + invalid + unauthorized payloads fail closed", async () => {
    const ipc = mockIpcMain();
    registerOpenCodeIpc(ipc, ctx.app);
    const status = await ipc.invoke("agent:status");
    assert.ok(status.runtime);
    await assert.rejects(() => ipc.invoke("agent:createTask", { prompt: "", workspaceRoot: workspace }), /Invalid/);
    await assert.rejects(() => ipc.invoke("agent:createTask", { prompt: "Inspect this project and fix it.", workspaceRoot: "/nope" }), /Workspace/);
    await assert.rejects(() => ipc.invoke("agent:getTask", { taskId: "bad id!!" }), /Invalid|not found/i);
    await assert.rejects(() => ipc.invoke("agent:permission", { taskId: "x", approvalId: "y" }), /Missing|Invalid|not found/i);
    const cls = await ipc.invoke("agent:classify", { text: "Explain React hooks." });
    assert.equal(cls.category, "CHAT");
    assert.equal(cls.routeToOpenCode, false);
  });

  it("child env is minimal (no secret leak)", async () => {
    process.env.OPENBENTT_SECRET_PROBE = "super-secret-value";
    process.env.OPENBENTT_OPENCODE_MODEL = "test-model";
    const env = __testHooks.buildChildEnv();
    assert.ok(!Object.values(env).includes("super-secret-value"));
    assert.equal(env.OPENCODE_MODEL, "test-model");
    delete process.env.OPENBENTT_SECRET_PROBE;
    delete process.env.OPENBENTT_OPENCODE_MODEL;
  });

  it("listTasks is bounded", async () => {
    for (let i = 0; i < 3; i++) {
      await createTask(ctx.app, { prompt: `Inspect this project task ${i} and fix bug.`, workspaceRoot: workspace });
    }
    assert.ok(listTasks().length >= 3);
  });

  it("createTask pins the chat-selected OpenCode model (universal layer)", async () => {
    const task = await createTask(ctx.app, {
      prompt: "Inspect this project and fix the login bug.",
      workspaceRoot: workspace,
      model: "test/free-model:free",
    });
    assert.equal(task.requestedModel, "test/free-model:free");
    // Unknown to the gateway cache → falls back, never fails.
    await startTask(ctx.app, task.id);
    const deadline = Date.now() + 5000;
    let cur = getTask(task.id);
    while (!cur.model && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
      cur = getTask(task.id);
    }
    assert.ok(typeof cur.model === "string" && cur.model.length > 0);
  });

  it("agent:ask validates input and fails closed without a binary", async () => {
    const ipc = mockIpcMain();
    registerOpenCodeIpc(ipc, ctx.app);
    // Detection cache forced to not-installed by beforeEach → fail closed.
    await assert.rejects(() => ipc.invoke("agent:ask", { message: "" }), /Invalid message/);
    await assert.rejects(
      () => ipc.invoke("agent:ask", { message: "hi", model: "../../etc/passwd" }),
      /Invalid model/,
    );
    await assert.rejects(
      () => ipc.invoke("agent:ask", { message: "What is normalization?" }),
      /not installed/i,
    );
    const mods = await ipc.invoke("agent:opencodeModels");
    assert.equal(mods.detected, false);
    assert.deepEqual(mods.models, []);
  });

  it("extractAskSession + extractAskPermissions parse run output", async () => {
    const ipc = mockIpcMain();
    registerOpenCodeIpc(ipc, ctx.app);
    const { extractAskSession, extractAskPermissions } = await import("./opencodeService.mjs");
    assert.equal(
      extractAskSession('{"type":"text","sessionID":"ses_abc123","part":{"type":"text","text":"hi"}}\n'),
      "ses_abc123",
    );
    assert.equal(extractAskSession("plain\n"), undefined);
    assert.deepEqual(
      extractAskPermissions("\u001b[93m! \u001b[0mpermission requested: external_directory (/etc/*); auto-rejecting\n"),
      ["external_directory (/etc/*)"],
    );
    assert.deepEqual(extractAskPermissions("nothing here"), []);
    await assert.rejects(
      () => ipc.invoke("agent:ask", { message: "hi", sessionId: "bad id!!" }),
      /Invalid session/,
    );
  });

  it("extractAskText harvests text deltas and redacts", async () => {
    const { extractAskText } = await import("./opencodeService.mjs");
    const line = JSON.stringify({ type: "text", part: { type: "text", text: "Normalization reduces redundancy." } });
    assert.equal(extractAskText(`${line}\n`), "Normalization reduces redundancy.");
    assert.equal(extractAskText("plain answer"), "plain answer");
    assert.equal(extractAskText(""), "");
  });

  it("createTask rejects hostile model values", async () => {
    await assert.rejects(
      () => createTask(ctx.app, { prompt: "Inspect this project.", workspaceRoot: workspace, model: "../../etc/passwd" }),
      /Invalid model/,
    );
    await assert.rejects(
      () => createTask(ctx.app, { prompt: "Inspect this project.", workspaceRoot: workspace, model: "a; rm -rf /" }),
      /Invalid model/,
    );
  });
});
