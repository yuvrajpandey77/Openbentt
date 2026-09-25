import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import {
  __testHooks,
  buildServeEnv,
  dispatchServerEvent,
  handleFrame,
  setServerHooks,
  serverCreateSession,
  serverPrompt,
  serverReplyPermission,
  serverReplyQuestion,
  serverRejectQuestion,
  serverAbort,
  serverDiff,
  serverTodos,
  toModelRef,
} from "./opencodeServer.mjs";
import {
  describeServerPermission,
  describeServerQuestion,
  normalizeServerEvents,
  validateQuestionAnswers,
} from "../src/lib/agent/openCodeCore.mjs";

/** Minimal mock of the OpenCode serve REST surface. */
function startMockServer(routes = {}) {
  const seen = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      seen.push({ method: req.method, url: req.url, body: body ? JSON.parse(body) : undefined });
      const key = `${req.method} ${req.url.split("?")[0]}`;
      const handler = routes[key];
      if (!handler) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: `no route ${key}` }));
        return;
      }
      const out = handler({ url: req.url, body: body ? JSON.parse(body) : undefined });
      res.writeHead(out.status ?? 200, { "Content-Type": "application/json" });
      res.end(out.json !== undefined ? JSON.stringify(out.json) : "");
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, port: server.address().port, seen });
    });
  });
}

describe("opencodeServer adapter", () => {
  let mock = null;

  beforeEach(() => {
    __testHooks.reset();
  });

  afterEach(async () => {
    __testHooks.reset();
    if (mock) {
      await new Promise((r) => mock.server.close(r));
      mock = null;
    }
  });

  it("serve env is minimal (no secret inheritance)", () => {
    process.env.OPENBENTT_TEST_SECRET = "shh";
    const env = buildServeEnv();
    assert.equal(env.OPENBENTT_TEST_SECRET, undefined);
    assert.equal(env.OPENBENTT_MANAGED, "1");
    assert.ok(env.PATH);
    delete process.env.OPENBENTT_TEST_SECRET;
  });

  it("toModelRef splits provider/model, rejects hostile values", () => {
    assert.equal(toModelRef(undefined), undefined);
    assert.equal(toModelRef("auto"), undefined);
    assert.deepEqual(toModelRef("openai/gpt-5"), { providerID: "openai", id: "gpt-5" });
    assert.equal(toModelRef("baremodel"), undefined);
    assert.throws(() => toModelRef("a; rm -rf /"), /Invalid model/);
  });

  it("REST ops hit loopback with directory scoping", async () => {
    mock = await startMockServer({
      "POST /session": () => ({ json: { id: "ses_abc123" } }),
      "POST /session/ses_abc123/prompt_async": () => ({ status: 204 }),
      "POST /permission/per_xyz/reply": () => ({ json: true }),
      "POST /question/que_1/reply": () => ({ json: true }),
      "POST /question/que_2/reject": () => ({ json: true }),
      "POST /session/ses_abc123/abort": () => ({ json: true }),
      "GET /session/ses_abc123/diff": () => ({ json: [] }),
      "GET /session/ses_abc123/todo": () => ({ json: [{ content: "t", status: "pending", priority: "high" }] }),
    });
    __testHooks.setPort(mock.port);
    __testHooks.setStatus("READY");

    const created = await serverCreateSession({ directory: "/tmp/ws", title: "t", agent: "build", model: "openai/gpt-5" });
    assert.equal(created.id, "ses_abc123");
    await serverPrompt({ sessionID: "ses_abc123", directory: "/tmp/ws", text: "hello" });
    await serverReplyPermission({ requestID: "per_xyz", directory: "/tmp/ws", scope: "once" });
    await serverReplyQuestion({ requestID: "que_1", directory: "/tmp/ws", answers: [["a"]] });
    await serverRejectQuestion({ requestID: "que_2", directory: "/tmp/ws" });
    await serverAbort({ sessionID: "ses_abc123", directory: "/tmp/ws" });
    assert.deepEqual(await serverDiff({ sessionID: "ses_abc123", directory: "/tmp/ws" }), []);
    assert.equal((await serverTodos({ sessionID: "ses_abc123", directory: "/tmp/ws" })).length, 1);

    const promptCall = mock.seen.find((s) => s.url.startsWith("/session/ses_abc123/prompt_async"));
    assert.ok(promptCall.url.includes("directory="), "directory scoping required");
    assert.deepEqual(promptCall.body.parts, [{ type: "text", text: "hello" }]);
    const permCall = mock.seen.find((s) => s.url.startsWith("/permission/per_xyz"));
    assert.deepEqual(permCall.body, { reply: "once" });
  });

  it("REST validates ids fail-closed", async () => {
    mock = await startMockServer({});
    __testHooks.setPort(mock.port);
    __testHooks.setStatus("READY");
    await assert.rejects(() => serverPrompt({ sessionID: "nope", directory: "/tmp", text: "x" }), /Invalid session/);
    await assert.rejects(() => serverReplyPermission({ requestID: "xx", scope: "once" }), /Invalid request id/);
    await assert.rejects(() => serverPrompt({ sessionID: "ses_abc", directory: "/tmp", text: "  " }), /Invalid prompt/);
  });

  it("SSE frames dispatch to mapped tasks; unmapped sessions ignored", async () => {
    const delivered = [];
    const perms = [];
    const questions = [];
    setServerHooks({
      taskIdForSession: (sid) => (sid === "ses_mapped" ? "otask_1" : undefined),
      onServerEvents: (sid, evts) => delivered.push({ sid, evts }),
      onPermissionAsked: (e) => perms.push(e),
      onQuestionAsked: (e) => questions.push(e),
      onConnectionChange: () => {},
    });

    handleFrame('data: {"id":"evt_1","type":"session.next.text.delta","properties":{"timestamp":1000,"sessionID":"ses_mapped","assistantMessageID":"msg_1","textID":"t1","delta":"hello"}}');
    assert.equal(delivered.length, 1);
    assert.equal(delivered[0].evts[0].type, "agent.message.delta");
    assert.equal(delivered[0].evts[0].eventId, "evt_1");
    assert.equal(delivered[0].evts[0].taskId, "otask_1");

    // Unmapped session (e.g. user's own TUI) — ignored, never fabricated.
    handleFrame('data: {"id":"evt_2","type":"session.next.text.delta","properties":{"timestamp":1000,"sessionID":"ses_other","assistantMessageID":"msg_1","textID":"t1","delta":"hi"}}');
    assert.equal(delivered.length, 1);

    // Permission + question route to bridges.
    handleFrame('data: {"id":"evt_3","type":"permission.asked","properties":{"id":"per_1","sessionID":"ses_mapped","permission":"edit","patterns":["a.ts"],"metadata":{},"always":[]}}');
    assert.equal(perms.length, 1);
    handleFrame('data: {"id":"evt_4","type":"question.v2.asked","properties":{"id":"que_1","sessionID":"ses_mapped","questions":[{"header":"H","question":"Q?","options":[{"label":"A"}]}]}}');
    assert.equal(questions.length, 1);

    // Malformed frames never break the loop.
    handleFrame("data: not-json{{{");
    handleFrame(": keepalive");
    handleFrame("");
    assert.equal(delivered.length, 1);
  });

  it("dispatchServerEvent ignores unknown types (never fabricates)", () => {
    let n = 0;
    setServerHooks({
      taskIdForSession: () => "otask_1",
      onServerEvents: () => { n += 1; },
      onPermissionAsked: () => { n += 1; },
      onQuestionAsked: () => { n += 1; },
      onConnectionChange: () => {},
      onReconnected: () => {},
    });
    dispatchServerEvent({ id: "evt_x", type: "plugin.added", properties: { id: "x" } });
    dispatchServerEvent({ nonsense: true });
    dispatchServerEvent(null);
    assert.equal(n, 0);
  });

  it("bindings drive per-directory subscriptions (session events are directory-scoped)", async () => {
    const { __testHooks: hooks } = await import("./opencodeServer.mjs");
    hooks.setStatus("READY");
    assert.equal(hooks.subscriptionCount(), 0);
    hooks.bind("otask_a", "ses_aaaa1111", "/tmp/ws-a");
    assert.equal(hooks.subscriptionCount(), 1);
    // Same directory shares one subscriber; a second directory adds one.
    hooks.bind("otask_b", "ses_bbbb2222", "/tmp/ws-a");
    assert.equal(hooks.subscriptionCount(), 1);
    const { unbindServerSession } = await import("./opencodeServer.mjs");
    unbindServerSession("otask_a");
    assert.equal(hooks.subscriptionCount(), 1);
    unbindServerSession("otask_b");
    assert.equal(hooks.subscriptionCount(), 0);
    assert.throws(() => hooks.bind("", "ses_x", "/tmp"), /Invalid task/);
    assert.throws(() => hooks.bind("t", "nope", "/tmp"), /Invalid session/);
  });
});

describe("server event normalization (openCodeCore)", () => {
  it("tool called/success preserve tool + output", () => {
    const called = normalizeServerEvents(
      { id: "evt_c", type: "session.next.tool.called", properties: { timestamp: 1, sessionID: "ses_a", assistantMessageID: "msg_a", callID: "call_1", tool: "bash", input: { command: "ls" }, provider: { executed: true } } },
      { taskId: "otask_9", sessionId: "ses_a" },
    );
    assert.equal(called.length, 1);
    assert.equal(called[0].type, "agent.tool.started");
    assert.equal(called[0].payload.tool, "bash");
    assert.equal(called[0].eventId, "evt_c");

    const ok = normalizeServerEvents(
      { id: "evt_s", type: "session.next.tool.success", properties: { timestamp: 2, sessionID: "ses_a", assistantMessageID: "msg_a", callID: "call_1", structured: {}, content: [{ text: "out" }], provider: { executed: true } } },
      { taskId: "otask_9", sessionId: "ses_a" },
    );
    assert.equal(ok[0].type, "agent.tool.completed");
    assert.equal(ok[0].payload.output, "out");
  });

  it("session status busy/idle map to status + idle", () => {
    const busy = normalizeServerEvents(
      { id: "e1", type: "session.status", properties: { sessionID: "ses_a", status: { type: "busy" } } },
      { taskId: "t", sessionId: "ses_a" },
    );
    assert.equal(busy[0].type, "agent.session.status");
    const idle = normalizeServerEvents(
      { id: "e2", type: "session.idle", properties: { sessionID: "ses_a" } },
      { taskId: "t", sessionId: "ses_a" },
    );
    assert.equal(idle[0].type, "agent.session.idle");
  });

  it("session errors surface with names", () => {
    const evts = normalizeServerEvents(
      { id: "e3", type: "session.error", properties: { sessionID: "ses_a", error: { name: "ContextOverflowError", message: "too long" } } },
      { taskId: "t", sessionId: "ses_a" },
    );
    assert.equal(evts[0].type, "agent.error");
    assert.match(evts[0].payload.message, /ContextOverflow/);
  });

  it("todos + diffs map to replace-state events", () => {
    const todos = normalizeServerEvents(
      { id: "e4", type: "todo.updated", properties: { sessionID: "ses_a", todos: [{ content: "x", status: "in_progress", priority: "high" }] } },
      { taskId: "t", sessionId: "ses_a" },
    );
    assert.equal(todos[0].type, "agent.todo.updated");
    const diff = normalizeServerEvents(
      { id: "e5", type: "session.diff", properties: { sessionID: "ses_a", diff: [{ file: "a.ts", status: "modified", additions: 2, deletions: 1, patch: "@@ x" }] } },
      { taskId: "t", sessionId: "ses_a" },
    );
    assert.equal(diff[0].type, "agent.diff.updated");
    assert.equal(diff[0].payload.files[0].file, "a.ts");
  });

  it("describeServerPermission supports v1 + v2, rejects junk", () => {
    const v1 = describeServerPermission({ id: "per_1", sessionID: "ses_a", permission: "edit", patterns: ["a.ts"], metadata: {}, always: [] });
    assert.equal(v1.kind, "v1");
    assert.equal(v1.action, "edit");
    const v2 = describeServerPermission({ id: "per_2", sessionID: "ses_a", action: "bash", resources: ["ls"], metadata: {} });
    assert.equal(v2.kind, "v2");
    assert.deepEqual(v2.resources, ["ls"]);
    assert.throws(() => describeServerPermission({}), /Invalid permission/);
    assert.throws(() => describeServerPermission({ id: "xx", sessionID: "ses_a" }), /Invalid permission id/);
    assert.throws(() => describeServerPermission({ id: "per_9", sessionID: "ses_a", weird: true }), /Unrecognized/);
  });

  it("describeServerQuestion + validateQuestionAnswers are fail-closed", () => {
    const q = describeServerQuestion({
      id: "que_1", sessionID: "ses_a",
      questions: [{ header: "DB", question: "Which?", options: [{ label: "pg" }, { label: "sqlite" }] }],
    });
    assert.equal(q.questions[0].options.length, 2);
    assert.deepEqual(validateQuestionAnswers(q.questions, [["pg"]]), [["pg"]]);
    assert.throws(() => validateQuestionAnswers(q.questions, [["mysql"]]), /Invalid option/);
    assert.throws(() => validateQuestionAnswers(q.questions, []), /must match/);
    assert.throws(() => describeServerQuestion({ id: "que_2", sessionID: "ses_a", questions: [] }), /no questions/);
  });

  it("payloads are secret-redacted", () => {
    const evts = normalizeServerEvents(
      { id: "e6", type: "session.next.text.delta", properties: { timestamp: 1, sessionID: "ses_a", assistantMessageID: "m", textID: "t", delta: "key api_key=supersecretvalue" } },
      { taskId: "t", sessionId: "ses_a" },
    );
    assert.match(evts[0].payload.delta, /redacted/);
  });

  it("tool parts map pending/running/completed with bash terminal fan-out", () => {
    const bind = { taskId: "t", sessionId: "ses_a" };
    const pending = normalizeServerEvents(
      { id: "e_p", type: "message.part.updated", properties: { sessionID: "ses_a", part: { id: "prt_1", messageID: "msg_1", type: "tool", tool: "bash", callID: "call_1", state: { status: "pending", input: {} } } } },
      bind,
    );
    assert.deepEqual(pending.map((e) => e.type), ["agent.tool.started"]);
    assert.equal(pending[0].eventId, "e_p#tool");

    const running = normalizeServerEvents(
      { id: "e_r", type: "message.part.updated", properties: { sessionID: "ses_a", part: { id: "prt_1", messageID: "msg_1", type: "tool", tool: "bash", callID: "call_1", state: { status: "running", input: { command: "ls -la", workdir: "/tmp/w" } } } } },
      bind,
    );
    assert.deepEqual(running.map((e) => e.type), ["agent.tool.progress"]);

    const done = normalizeServerEvents(
      { id: "e_d", type: "message.part.updated", properties: { sessionID: "ses_a", part: { id: "prt_1", messageID: "msg_1", type: "tool", tool: "bash", callID: "call_1", state: { status: "completed", input: { command: "ls -la" }, output: "a.txt\n", metadata: { exit: 0 }, title: "ls -la", time: { start: 1, end: 11 } } } } },
      bind,
    );
    assert.deepEqual(done.map((e) => e.type), ["agent.tool.completed", "agent.terminal.completed"]);
    assert.equal(done[0].payload.output, "a.txt\n");
    assert.equal(done[1].payload.exitCode, 0);
    assert.ok(done[0].eventId !== done[1].eventId, "multi-emission ids stay distinct");
  });

  it("write completion emits file.changed; failures surface", () => {
    const bind = { taskId: "t", sessionId: "ses_a" };
    const done = normalizeServerEvents(
      { id: "e_w", type: "message.part.updated", properties: { sessionID: "ses_a", part: { id: "prt_2", messageID: "msg_1", type: "tool", tool: "write", callID: "call_2", state: { status: "completed", input: { filePath: "/tmp/w/f.txt" }, output: "ok" } } } },
      bind,
    );
    assert.deepEqual(done.map((e) => e.type), ["agent.tool.completed", "agent.file.changed"]);
    assert.equal(done[1].payload.file, "/tmp/w/f.txt");
    const failed = normalizeServerEvents(
      { id: "e_f", type: "message.part.updated", properties: { sessionID: "ses_a", part: { id: "prt_3", messageID: "msg_1", type: "tool", tool: "read", callID: "call_3", state: { status: "error", input: {}, error: "nope" } } } },
      bind,
    );
    assert.equal(failed[0].type, "agent.tool.failed");
    assert.match(failed[0].payload.message, /nope/);
  });

  it("text parts stream as snapshots; user echoes drop", () => {
    const bind = { taskId: "t", sessionId: "ses_a" };
    const txt = normalizeServerEvents(
      { id: "e_t", type: "message.part.updated", properties: { sessionID: "ses_a", part: { id: "prt_9", messageID: "msg_a", type: "text", text: "hello" } } },
      bind,
    );
    assert.equal(txt[0].type, "agent.message.completed");
    assert.equal(txt[0].payload.text, "hello");
    const echo = normalizeServerEvents(
      { id: "e_u", type: "message.part.updated", properties: { sessionID: "ses_a", part: { id: "prt_8", messageID: "msg_u", type: "text", text: "my prompt" } } },
      { ...bind, messageRole: "user" },
    );
    assert.deepEqual(echo, []);
    const delta = normalizeServerEvents(
      { id: "e_dl", type: "message.part.delta", properties: { sessionID: "ses_a", messageID: "msg_a", partID: "prt_9", field: "text", delta: "hi" } },
      bind,
    );
    assert.equal(delta[0].type, "agent.message.delta");
  });

  it("step-finish carries tokens into context; dispatcher tracks roles", () => {
    const bind = { taskId: "t", sessionId: "ses_a" };
    const fin = normalizeServerEvents(
      { id: "e_sf", type: "message.part.updated", properties: { sessionID: "ses_a", part: { id: "prt_s", messageID: "msg_a", type: "step-finish", reason: "stop", tokens: { input: 10, output: 5 }, cost: 0 } } },
      bind,
    );
    assert.deepEqual(fin.map((e) => e.type), ["agent.step.completed", "agent.context.updated"]);
    assert.equal(fin[1].payload.input, 10);

    const seen = [];
    setServerHooks({
      taskIdForSession: (sid) => (sid === "ses_a" ? "t" : undefined),
      onServerEvents: (sid, evts) => seen.push(...evts),
      onPermissionAsked: () => {},
      onQuestionAsked: () => {},
      onConnectionChange: () => {},
      onReconnected: () => {},
    });
    dispatchServerEvent({ id: "m1", type: "message.updated", properties: { sessionID: "ses_a", info: { id: "msg_u", role: "user" } } });
    dispatchServerEvent({ id: "m2", type: "message.updated", properties: { sessionID: "ses_a", info: { id: "msg_a", role: "assistant", tokens: { input: 3, output: 1 } } } });
    // Assistant message.completed + context; user echo produces nothing.
    assert.ok(seen.some((e) => e.type === "agent.context.updated"));
    dispatchServerEvent({ id: "e_ux", type: "message.part.updated", properties: { sessionID: "ses_a", part: { id: "prt_u", messageID: "msg_u", type: "text", text: "prompt echo" } } });
    assert.ok(!seen.some((e) => e.eventId === "e_ux"), "user echo must not enter the stream");
  });
});
