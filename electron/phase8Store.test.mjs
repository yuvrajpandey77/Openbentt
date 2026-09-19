/**
 * Phase 8 — main-process action/sync/workflow/MCP-server tests (node:test).
 * Temp userData, no network, no provider credentials. Live provider paths
 * are NOT exercised here (see docs live matrix — BLOCKED without creds).
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { closeDb, getDb, getSchemaVersion } from "./researchDb.mjs";
import {
  approveAction,
  consumeApprovalForExecution,
  findExecutionByKey,
  getApproval,
  listApprovals,
  listExecutions,
  proposeAction,
  recordExecution,
  rejectAction,
} from "./actionStore.mjs";
import {
  hasWriteGrant,
  refreshOAuthToken,
  writeOAuthToken,
  writeScopesFor,
} from "./connectorAuthStore.mjs";
import {
  getSyncConfig,
  listSyncConfigs,
  runConnectorSyncNow,
  setSyncConfig,
} from "./syncScheduler.mjs";
import {
  cancelWorkflowRun,
  createWorkflow,
  deleteWorkflow,
  getWorkflow,
  getWorkflowRun,
  listWorkflowRuns,
  listWorkflows,
  startWorkflowRun,
  updateWorkflow,
} from "./workflowStore.mjs";
import {
  getMcpServerConfig,
  setMcpServerConfig,
} from "./mcpServer.mjs";
import { executeToolMain, listToolDefinitions } from "./toolStore.mjs";
import { registerResearchProjectIpc } from "./researchProjectService.mjs";
import { makeTempUserData } from "./test/researchTestApp.mjs";
import { actionFingerprint } from "../src/lib/actions/actionCore.mjs";

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

const GMAIL_INPUT = { to: ["customer@example.com"], subject: "Project update", body: "Hello" };

describe("phase 8 schema v12", () => {
  let ctx;
  let app;
  beforeEach(async () => {
    ctx = await makeTempUserData();
    app = ctx.app;
    closeDb();
  });
  afterEach(async () => {
    closeDb();
    await ctx.cleanup();
  });

  it("migrates v12 tables additively", () => {
    assert.ok(getSchemaVersion() >= 12);
    const db = getDb(app);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
    for (const t of ["action_approvals", "action_executions", "sync_config", "workflows", "workflow_runs", "mcp_server_config"]) {
      assert.ok(tables.includes(t), `missing ${t}`);
    }
    const ver = db.prepare("SELECT version FROM schema_version ORDER BY version DESC LIMIT 1").get();
    assert.equal(ver.version, getSchemaVersion());
  });
});

describe("action approvals + idempotency", () => {
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

  it("proposes with fingerprint + preview, approves, consumes single-use", () => {
    const a = proposeAction(app, {
      toolId: "gmail.create_draft", projectId: "p1", runId: "arun_1",
      requestId: "treq_1", input: GMAIL_INPUT, risk: "MEDIUM",
    });
    assert.equal(a.status, "proposed");
    assert.equal(a.fingerprint, actionFingerprint("gmail.create_draft", "p1", GMAIL_INPUT));
    assert.ok(a.preview.some((l) => l.label === "To" && l.value.includes("customer@example.com")));
    assert.ok(a.expiresAt > new Date().toISOString());

    const approved = approveAction(app, a.id);
    assert.equal(approved.status, "approved");
    const consumed = consumeApprovalForExecution(app, a.id, {
      toolId: "gmail.create_draft", projectId: "p1", runId: "arun_1", input: GMAIL_INPUT,
    });
    assert.equal(consumed.status, "consumed");
    // Single-use: second consume fails.
    assert.throws(() => consumeApprovalForExecution(app, a.id, {
      toolId: "gmail.create_draft", projectId: "p1", runId: "arun_1", input: GMAIL_INPUT,
    }), /consumed/);
  });

  it("rejects parameter substitution after approval", () => {
    const a = proposeAction(app, {
      toolId: "gmail.send", projectId: "p1", requestId: "t2", input: GMAIL_INPUT, risk: "HIGH",
    });
    approveAction(app, a.id);
    assert.throws(() => consumeApprovalForExecution(app, a.id, {
      toolId: "gmail.send", projectId: "p1",
      input: { ...GMAIL_INPUT, to: ["attacker@example.com"] },
    }), /changed since approval/);
  });

  it("rejects and lists approvals", () => {
    const a = proposeAction(app, { toolId: "slack.send_message", requestId: "t3", input: { channel: "C1", text: "hi" }, risk: "MEDIUM" });
    const rejected = rejectAction(app, a.id);
    assert.equal(rejected.status, "rejected");
    assert.equal(listApprovals(app, { status: "rejected" }).length, 1);
    assert.equal(getApproval(app, "missing"), null);
  });

  it("records and finds executions by idempotency key", () => {
    assert.equal(findExecutionByKey(app, "idem_testkey1"), null);
    const stored = recordExecution(app, {
      idempotencyKey: "idem_testkey1", toolId: "gmail.create_draft",
      fingerprint: "afp_deadbeef", projectId: "p1", status: "succeeded",
      provider: "Gmail", externalId: "d123", result: { draft: { draftId: "d123" } },
    });
    assert.equal(stored.externalId, "d123");
    assert.equal(listExecutions(app, { projectId: "p1" }).length, 1);
  });
});

describe("write grants + refresh honesty", () => {
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

  it("requires incremental write scopes", async () => {
    assert.deepEqual(writeScopesFor("gmail"), ["https://www.googleapis.com/auth/gmail.send"]);
    await writeOAuthToken(app, "gmail", { accessToken: "x", scopes: ["https://www.googleapis.com/auth/gmail.readonly"] });
    assert.equal(await hasWriteGrant(app, "gmail"), false);
    await writeOAuthToken(app, "gmail", {
      accessToken: "x",
      scopes: ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send"],
    });
    assert.equal(await hasWriteGrant(app, "gmail"), true);
  });

  it("refresh fails honestly without a refresh token", async () => {
    await writeOAuthToken(app, "slack", { accessToken: "x" });
    await assert.rejects(refreshOAuthToken(app, "slack"), /reconnect/);
    await assert.rejects(refreshOAuthToken(app, "dropbox"), /Unknown connector/);
  });
});

describe("sync config + offline run honesty", () => {
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

  it("validates intervals and defaults to disabled", () => {
    const cfg = getSyncConfig(app, "gmail");
    assert.equal(cfg.enabled, false);
    assert.equal(cfg.intervalMinutes, 15);
    assert.throws(() => setSyncConfig(app, "gmail", { intervalMinutes: 1 }), /5–1440/);
    assert.throws(() => setSyncConfig(app, "dropbox", { enabled: true }), /unknown connector/);
    const on = setSyncConfig(app, "gmail", { enabled: true, intervalMinutes: 10 });
    assert.equal(on.enabled, true);
    assert.equal(on.intervalMinutes, 10);
    assert.ok(on.nextRunAt);
    assert.equal(listSyncConfigs(app).length, 6);
  });

  it("fails a run honestly without a connection (no fake sync)", async () => {
    const res = await runConnectorSyncNow(app, "gmail", { reason: "manual" });
    assert.equal(res.status, "failed");
    assert.match(res.error, /not connected/);
  });
});

describe("workflows", () => {
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

  it("validates definitions on create/update", () => {
    assert.throws(() => createWorkflow(app, { name: "", trigger: { kind: "manual" }, steps: [] }), /name/);
    assert.throws(() => createWorkflow(app, {
      name: "x", trigger: { kind: "schedule", intervalMinutes: 1 },
      steps: [{ kind: "tool_call", toolId: "knowledge.search" }],
    }), /5–1440/);
    const wf = createWorkflow(app, {
      name: "Triage", trigger: { kind: "manual" },
      steps: [{ kind: "tool_call", toolId: "knowledge.search", input: { query: "atlas" } }],
    });
    assert.equal(getWorkflow(app, wf.id).name, "Triage");
    assert.equal(listWorkflows(app).length, 1);
    const updated = updateWorkflow(app, wf.id, { trigger: { kind: "schedule", intervalMinutes: 30 } });
    assert.equal(updated.trigger.kind, "schedule");
    deleteWorkflow(app, wf.id);
    assert.equal(getWorkflow(app, wf.id), null);
  });

  it("executes real read steps and records history", async () => {
    const wf = createWorkflow(app, {
      name: "Search", trigger: { kind: "manual" },
      steps: [{ kind: "tool_call", toolId: "knowledge.search", input: { query: "atlas" } }],
    });
    const run = await startWorkflowRun(app, wf.id, { triggerKind: "manual", state: {} });
    assert.equal(run.status, "completed");
    assert.equal(getWorkflowRun(app, run.id).status, "completed");
    assert.equal(listWorkflowRuns(app, { workflowId: wf.id }).length, 1);
  });

  it("suspends on confirmation-gated tools (no silent execution)", async () => {
    const wf = createWorkflow(app, {
      name: "Draft", trigger: { kind: "manual" },
      steps: [{ kind: "tool_call", toolId: "gmail.create_draft", input: GMAIL_INPUT }],
    });
    const run = await startWorkflowRun(app, wf.id, { triggerKind: "manual", state: {} });
    assert.equal(run.status, "awaiting_approval");
    assert.ok(run.state.pendingApprovalId);
    const cancelled = cancelWorkflowRun(app, run.id);
    assert.equal(cancelled.status, "cancelled");
  });

  it("fails resume when the approval was rejected (no execution)", async () => {
    const { rejectAction } = await import("./actionStore.mjs");
    const { resumeWorkflowRun } = await import("./workflowStore.mjs");
    const wf = createWorkflow(app, {
      name: "Draft2", trigger: { kind: "manual" },
      steps: [{ kind: "tool_call", toolId: "gmail.create_draft", input: GMAIL_INPUT }],
    });
    const run = await startWorkflowRun(app, wf.id, { triggerKind: "manual", state: {} });
    assert.equal(run.status, "awaiting_approval");
    rejectAction(app, run.state.pendingApprovalId);
    const resumed = await resumeWorkflowRun(app, run.id);
    assert.equal(resumed.status, "failed");
    assert.match(resumed.error, /rejected/);
  });
});

describe("action gate in the executor", () => {
  let ctx;
  let app;
  beforeEach(async () => {
    ctx = await makeTempUserData();
    app = ctx.app;
    closeDb();
    getDb(app);
    // Write grants for the exercised connectors (fail-closed grant check
    // runs before approval logic; tokens are local vault fixtures only).
    await writeOAuthToken(app, "gmail", {
      accessToken: "test", scopes: ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send"],
    });
    await writeOAuthToken(app, "github", {
      accessToken: "test", scopes: ["read:user", "repo"],
    });
    await writeOAuthToken(app, "slack", {
      accessToken: "test", scopes: ["channels:history", "chat:write"],
    });
  });
  afterEach(async () => {
    closeDb();
    await ctx.cleanup();
  });

  it("denies execution without a write grant (fail closed)", async () => {
    await writeOAuthToken(app, "github", null);
    const res = await executeToolMain(app, "github.create_issue", { repository: "acme/web", title: "t" }, {
      projectId: "p1", userInitiated: true, userConfirmed: true,
      confirmedToolId: "github.create_issue", source: "chat",
    });
    assert.equal(res.decision, "DENY");
    assert.equal(res.errorKind, "authentication_failed");
  });

  it("CONFIRMs unconfirmed actions with a bound approval + preview", async () => {
    const defs = listToolDefinitions();
    assert.ok(defs.some((d) => d.id === "gmail.create_draft"));
    const res = await executeToolMain(app, "gmail.create_draft", GMAIL_INPUT, {
      projectId: "p1", userInitiated: true, source: "agent:arun_gate1",
    });
    assert.equal(res.ok, false);
    assert.equal(res.decision, "CONFIRM");
    assert.ok(res.data.approvalId);
    assert.ok(res.data.fingerprint);
    assert.ok(Array.isArray(res.data.preview));
    const stored = getApproval(app, res.data.approvalId);
    assert.equal(stored.toolId, "gmail.create_draft");
    assert.equal(stored.runId, "arun_gate1");
  });

  it("DENYs invalid targets before any approval", async () => {
    const res = await executeToolMain(app, "gmail.send", { to: ["nope"], subject: "s", body: "b" }, {
      projectId: "p1", userInitiated: true, source: "chat",
    });
    assert.equal(res.decision, "DENY");
  });

  it("refuses execution without a bound approval (needs re-confirm)", async () => {
    const res = await executeToolMain(app, "github.create_issue", { repository: "acme/web", title: "t" }, {
      projectId: "p1", userInitiated: true, userConfirmed: true,
      confirmedToolId: "github.create_issue", source: "chat",
    });
    assert.equal(res.decision, "CONFIRM");
  });

  it("dedupes on idempotency key without touching the provider", async () => {
    recordExecution(app, {
      idempotencyKey: "idem_cached0001", toolId: "slack.send_message",
      fingerprint: actionFingerprint("slack.send_message", "p1", { channel: "C1", text: "hi" }),
      projectId: "p1", status: "succeeded", provider: "Slack",
      externalId: "C1:123", result: { message: { channel: "C1", ts: "123" } },
    });
    const res = await executeToolMain(app, "slack.send_message",
      { channel: "C1", text: "hi", idempotencyKey: "idem_cached0001" }, {
        projectId: "p1", userInitiated: true, userConfirmed: true,
        confirmedToolId: "slack.send_message", source: "chat",
      });
    assert.equal(res.ok, true);
    assert.equal(res.data.deduplicated, true);
    assert.equal(res.data.message.ts, "123");
  });

  it("blocks blind retry on unknown prior state", async () => {
    recordExecution(app, {
      idempotencyKey: "idem_unknown001", toolId: "gmail.send",
      fingerprint: actionFingerprint("gmail.send", "p1", GMAIL_INPUT),
      projectId: "p1", status: "unknown", provider: "Gmail", result: {},
    });
    const res = await executeToolMain(app, "gmail.send", { ...GMAIL_INPUT, idempotencyKey: "idem_unknown001" }, {
      projectId: "p1", userInitiated: true, userConfirmed: true,
      confirmedToolId: "gmail.send", source: "chat",
    });
    assert.equal(res.ok, false);
    assert.equal(res.data.executionStatus, "unknown");
  });
});

describe("phase 8 IPC channels", () => {
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

  it("registers actions/sync/workflows/agents/mcpserver with allowlists", async () => {
    const ipc = mockIpcMain();
    registerResearchProjectIpc(ipc, app);
    await assert.rejects(ipc.invoke("research:actions", "nope"), /Unknown actions operation/);
    await assert.rejects(ipc.invoke("research:sync", "nope"), /Unknown sync operation/);
    await assert.rejects(ipc.invoke("research:workflows", "nope"), /Unknown workflows operation/);
    await assert.rejects(ipc.invoke("research:agents", "nope"), /Unknown agents operation/);
    await assert.rejects(ipc.invoke("research:mcpserver", "nope"), /Unknown mcpserver operation/);

    const roles = await ipc.invoke("research:agents", "list");
    assert.equal(roles.length, 5);
    const role = await ipc.invoke("research:agents", "get", { agentId: "engineering-assistant" });
    assert.ok(role.toolAllowlist.includes("github.create_pull_request"));

    const configs = await ipc.invoke("research:sync", "configs");
    assert.equal(configs.length, 6);
    await assert.rejects(ipc.invoke("research:sync", "set", { connectorId: "gmail", intervalMinutes: 1 }), /5–1440/);

    const wf = await ipc.invoke("research:workflows", "create", {
      workflow: {
        name: "IPC", trigger: { kind: "manual" },
        steps: [{ kind: "tool_call", toolId: "knowledge.search", input: { query: "x" } }],
      },
    });
    assert.ok(wf.id);
    const run = await ipc.invoke("research:workflows", "start", { workflowId: wf.id });
    assert.equal(run.status, "completed");

    const grant = await ipc.invoke("research:actions", "writeGrant", { connectorId: "gmail" });
    assert.equal(grant.hasWriteGrant, false);

    const ms = await ipc.invoke("research:mcpserver", "status");
    assert.equal(ms.enabled, false);
    assert.equal(ms.running, false);
    await assert.rejects(ipc.invoke("research:mcpserver", "start"), /disabled/);
  });
});

describe("mcp server config", () => {
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

  it("stays off by default and validates config", () => {
    assert.equal(getMcpServerConfig(app).enabled, false);
    assert.throws(() => setMcpServerConfig(app, { port: 80 }), /port/);
    assert.throws(() => setMcpServerConfig(app, { allowedTools: ["gmail.send"] }), /not exposable/);
    const cfg = setMcpServerConfig(app, { enabled: true, port: 3877, allowedTools: ["knowledge.search"] });
    assert.equal(cfg.enabled, true);
    assert.deepEqual(cfg.allowedTools, ["knowledge.search"]);
  });
});
