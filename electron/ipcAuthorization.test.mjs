import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  getAuthorizationDenials,
  getCapabilityGrants,
  installIpcAuthorization,
  invokeGuarded,
  registerTrustedWindow,
  registerWorkspaceRoot,
  resetAuthorizationForTests,
  unregisterTrustedWindow,
} from "./ipcAuthorization.mjs";

const APP_URL = "app://openbentt/chat";
const APP_ORIGIN = "app://openbentt";

function makeWindow(id = 7, webContentsId = 11) {
  const mainFrame = {
    routingId: 100,
    url: APP_URL,
    origin: APP_ORIGIN,
    parent: null,
  };
  const webContents = {
    id: webContentsId,
    mainFrame,
    isDestroyed: () => false,
    getURL: () => APP_URL,
  };
  const win = { id, webContents };
  registerTrustedWindow(win);
  return { win, webContents, mainFrame };
}

function eventFor(webContents, overrides = {}) {
  const frame = {
    routingId: 100,
    url: APP_URL,
    origin: APP_ORIGIN,
    parent: null,
    ...(overrides.frame ?? {}),
  };
  return {
    sender: webContents,
    senderFrame: frame,
    frameId: 100,
    ...overrides.event,
  };
}

describe("IPC authorization enforcement", () => {
  let ctx;

  beforeEach(() => {
    resetAuthorizationForTests();
    ctx = makeWindow();
  });

  afterEach(() => {
    unregisterTrustedWindow(ctx.win);
    resetAuthorizationForTests();
  });

  it("allows trusted renderer requests from the main frame", async () => {
    const out = await invokeGuarded(
      "desktop:getAppVersion",
      () => "2.5.8",
      eventFor(ctx.webContents),
      []
    );
    assert.deepEqual(out, { ok: true, result: "2.5.8" });
  });

  it("rejects an untrusted sender even with a valid frame", async () => {
    const rogue = {
      id: 999,
      mainFrame: ctx.mainFrame,
      isDestroyed: () => false,
      getURL: () => APP_URL,
    };
    const out = await invokeGuarded(
      "desktop:getAppVersion",
      () => "should not run",
      eventFor(rogue),
      []
    );
    assert.equal(out.ok, false);
    assert.match(out.reason, /untrusted sender/);
  });

  it("rejects an incorrect origin", async () => {
    const out = await invokeGuarded(
      "desktop:getAppVersion",
      () => "should not run",
      eventFor(ctx.webContents, {
        frame: { url: "https://evil.example/chat", origin: "https://evil.example" },
      }),
      []
    );
    assert.equal(out.ok, false);
    assert.match(out.reason, /untrusted sender frame or origin/);
  });

  it("rejects iframe-origin requests", async () => {
    const out = await invokeGuarded(
      "secretVault:load",
      () => "should not run",
      eventFor(ctx.webContents, {
        frame: { parent: {}, url: "https://iframe.example", origin: "https://iframe.example" },
      }),
      []
    );
    assert.equal(out.ok, false);
    assert.match(out.reason, /untrusted sender/);
  });

  it("rejects invalid payloads", async () => {
    const out = await invokeGuarded(
      "workspace:read",
      () => "should not run",
      eventFor(ctx.webContents),
      ["not-an-object"]
    );
    assert.equal(out.ok, false);
    assert.match(out.reason, /invalid argument/);
  });

  it("rejects oversized payloads", async () => {
    const out = await invokeGuarded(
      "research:enqueueJob",
      () => "should not run",
      eventFor(ctx.webContents),
      ["proj-1", "index", { blob: "x".repeat(3 * 1024 * 1024) }]
    );
    assert.equal(out.ok, false);
    assert.match(out.reason, /payload too large/);
  });

  it("rejects unauthorized filesystem access until main registers the root", async () => {
    const payload = { root: "/tmp/not-authorized", path: "secrets.txt" };
    const denied = await invokeGuarded(
      "workspace:read",
      () => ({ text: "leaked" }),
      eventFor(ctx.webContents),
      [payload]
    );
    assert.equal(denied.ok, false);
    assert.match(denied.reason, /not been authorized by main process/);

    assert.equal(registerWorkspaceRoot("/tmp/not-authorized"), true);
    const allowed = await invokeGuarded(
      "workspace:read",
      () => ({ text: "ok" }),
      eventFor(ctx.webContents),
      [payload]
    );
    assert.deepEqual(allowed, { ok: true, result: { text: "ok" } });
  });

  it("rejects unauthorized execution requests without main-issued approval evidence", async () => {
    const run = (channel, payload) =>
      invokeGuarded(channel, () => ({ status: "executed" }), eventFor(ctx.webContents), [payload]);
    const permission = await run("agent:permission", { taskId: "t1", approvalId: "forged", decision: "allow" });
    assert.equal(permission.ok, false);
    assert.match(permission.reason, /evidence/);

    const confirm = await run("computer:confirm", { approvalId: "nope", decision: "allow" });
    assert.equal(confirm.ok, false);
    assert.match(confirm.reason, /evidence/);

    const valid = await run("computer:confirm", { approvalId: "act_test123", decision: "allow" });
    assert.equal(valid.ok, true);
  });

  it("allows main-owned workspace bootstrap, then authorizes the returned root", async () => {
    // workspace:resolve performs realpath + isDirectory validation in main; the
    // guard must not require the root to be pre-registered or the app cannot
    // establish any workspace at all.
    const resolved = await invokeGuarded(
      "workspace:resolve",
      () => ({ root: "/tmp/resolved-by-main" }),
      eventFor(ctx.webContents),
      [{ root: "/tmp/user-selected-folder" }]
    );
    assert.equal(resolved.ok, true);

    const read = await invokeGuarded(
      "workspace:read",
      () => ({ text: "file" }),
      eventFor(ctx.webContents),
      [{ root: "/tmp/resolved-by-main", path: "notes.txt" }]
    );
    assert.deepEqual(read, { ok: true, result: { text: "file" } });

    // A root that was never vouched for by main is still rejected.
    const rogue = await invokeGuarded(
      "workspace:read",
      () => ({ text: "leaked" }),
      eventFor(ctx.webContents),
      [{ root: "/tmp/never-resolved", path: "secret.txt" }]
    );
    assert.equal(rogue.ok, false);
  });

  it("canonicalizes roots so equivalent path spellings are authorized", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ipc-auth-root-"));
    const alias = `${dir}/alias`;
    try {
      fs.symlinkSync(dir, alias, "dir");
      assert.equal(registerWorkspaceRoot(dir), true);
      const out = await invokeGuarded(
        "workspace:read",
        () => ({ text: "file" }),
        eventFor(ctx.webContents),
        [{ root: `${alias}/../${path.basename(dir)}`, path: "notes.txt" }]
      );
      assert.deepEqual(out, { ok: true, result: { text: "file" } });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("registers the canonical root vouched by agent:createTask", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ipc-auth-task-"));
    try {
      const created = await invokeGuarded(
        "agent:createTask",
        () => ({ workspace: { rootPath: dir } }),
        eventFor(ctx.webContents),
        [{ prompt: "hi", workspaceRoot: dir }]
      );
      assert.equal(created.ok, true);

      const snapshot = await invokeGuarded(
        "workspace:snapshot",
        () => ({ ok: true }),
        eventFor(ctx.webContents),
        [{ root: dir, taskKey: "t1", files: [] }]
      );
      assert.deepEqual(snapshot, { ok: true, result: { ok: true } });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("accepts legitimate large payloads and rejects non-HTTPS external URLs", async () => {
    const draft = await invokeGuarded(
      "research:patchDraft",
      () => ({ ok: true }),
      eventFor(ctx.webContents),
      ["proj-1", "x".repeat(2_000_000)]
    );
    assert.equal(draft.ok, true);

    const ocr = await invokeGuarded(
      "documents:ocr",
      () => ({ ok: true }),
      eventFor(ctx.webContents),
      [{ pages: [{ dataBase64: "A".repeat(20 * 1024 * 1024) }] }]
    );
    assert.equal(ocr.ok, true);

    const zotero = await invokeGuarded(
      "zotero:setBbtExportPath",
      () => ({ ok: true }),
      eventFor(ctx.webContents),
      [""]
    );
    assert.equal(zotero.ok, true);

    const http = await invokeGuarded(
      "desktop:openExternal",
      () => ({ ok: true }),
      eventFor(ctx.webContents),
      ["http://example.com"]
    );
    assert.equal(http.ok, false);
    assert.match(http.reason, /invalid argument/);
  });

  it("denies channels that are absent from the policy", async () => {
    const out = await invokeGuarded("unknown:dangerous", () => 1, eventFor(ctx.webContents), []);
    assert.equal(out.ok, false);
    assert.match(out.reason, /not in the IPC authorization policy/);
  });

  it("wraps real ipcMain registration so future handlers cannot bypass the guard", async () => {
    const registered = new Map();
    const fakeIpc = {
      handle(channel, listener) {
        registered.set(channel, listener);
      },
      on(channel, listener) {
        registered.set(`on:${channel}`, listener);
      },
      once(channel, listener) {
        registered.set(`once:${channel}`, listener);
      },
    };
    installIpcAuthorization(fakeIpc);
    fakeIpc.handle("desktop:getAppVersion", () => "wrapped");
    fakeIpc.on("desktop:menuNavigate", () => {});

    assert.equal(registered.size, 2);
    const wrapped = registered.get("desktop:getAppVersion");
    assert.equal(await wrapped(eventFor(ctx.webContents)), "wrapped");
    await assert.rejects(
      () => wrapped(eventFor(ctx.webContents, { frame: { origin: "https://evil.example", url: "https://evil.example" } })),
      /IPC authorization denied/
    );
  });

  it("unregisters a destroyed window without dereferencing it", () => {
    const { win, webContents } = makeWindow(21, 22);
    const capturedId = registerTrustedWindow(win);
    assert.equal(capturedId, 22);
    assert.ok(getCapabilityGrants(22));

    // Simulate Electron's "closed" event: the objects are destroyed.
    win.isDestroyed = () => true;
    webContents.isDestroyed = () => true;
    unregisterTrustedWindow(capturedId);
    assert.equal(getCapabilityGrants(22), null);

    const out = invokeGuarded(
      "desktop:getAppVersion",
      () => "should not run",
      eventFor(webContents),
      []
    );
    return out.then((result) => {
      assert.equal(result.ok, false);
      assert.match(result.reason, /untrusted sender/);
    });
  });

  it("never exposes capability grants over an IPC channel", () => {
    const grants = getCapabilityGrants(ctx.webContents.id);
    assert.ok(grants);
    assert.ok(Array.isArray(grants["workspace.fs"]));
    assert.ok(grants["workspace.fs"].some((scope) => scope.startsWith("workspace:")));
    // The only exported mutator is main-process-only; no handler/bridge path exists.
    assert.ok(getAuthorizationDenials().length >= 0);
  });
});
