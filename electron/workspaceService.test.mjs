import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { makeTempUserData } from "./test/researchTestApp.mjs";
import { closeDb } from "./researchDb.mjs";
import {
  __testHooks,
  detectGit,
  diffWorkspace,
  listWorkspace,
  readProjectInstructions,
  readWorkspaceFile,
  resolveInWorkspace,
  resolveWorkspaceRoot,
  snapshotWorkspace,
  statFile,
  undoWorkspace,
  verifyFiles,
  writeWorkspaceFiles,
} from "./workspaceService.mjs";

describe("workspaceService authority", () => {
  let dir;
  beforeEach(async () => {
    __testHooks.reset();
    dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "openbentt-ws-"));
    await fs.promises.writeFile(path.join(dir, "main.tex"), "\\documentclass{article}\n\\begin{document}\nHi\n\\end{document}\n");
    await fs.promises.writeFile(path.join(dir, "notes.md"), "# notes\n");
  });
  afterEach(async () => {
    __testHooks.reset();
    await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
  });

  it("resolves canonical root and rejects missing dirs", async () => {
    const root = await resolveWorkspaceRoot(dir);
    assert.equal(root, await fs.promises.realpath(dir));
    await assert.rejects(() => resolveWorkspaceRoot("/nope/nothing"), /does not exist/);
  });

  it("blocks traversal and symlink escapes", async () => {
    await assert.rejects(() => resolveInWorkspace(dir, "../outside"), /escapes/);
    const outside = await fs.promises.mkdtemp(path.join(os.tmpdir(), "openbentt-out-"));
    try {
      await fs.promises.symlink(outside, path.join(dir, "evil"));
      await assert.rejects(() => resolveInWorkspace(dir, "evil"), /escapes/);
    } finally {
      await fs.promises.rm(outside, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("verifies claimed files against disk (never trusts text)", async () => {
    const out = await verifyFiles(dir, [{ path: "main.tex" }, { path: "ghost.tex" }]);
    assert.equal(out[0].exists, true);
    assert.ok(out[0].hash.length === 64 && out[0].size > 0);
    assert.equal(out[1].exists, false);
  });

  it("snapshots, diffs real changes, and undoes", async () => {
    await snapshotWorkspace(dir, "t1", ["main.tex", "notes.md"]);
    await fs.promises.writeFile(path.join(dir, "main.tex"), "\\documentclass{article}\n\\begin{document}\nBye\n\\end{document}\n");
    const diffs = await diffWorkspace("t1");
    assert.equal(diffs.length, 1);
    assert.equal(diffs[0].path, "main.tex");
    assert.ok(diffs[0].patch.includes("-Hi") && diffs[0].patch.includes("+Bye"));
    const undone = await undoWorkspace("t1", ["main.tex"]);
    assert.deepEqual(undone.restored, ["main.tex"]);
    const back = await readWorkspaceFile(dir, "main.tex", 10000);
    assert.ok(back.text.includes("Hi"));
  });

  it("lists, reads bounded, and loads project instructions", async () => {
    const list = await listWorkspace(dir, ".", 2);
    assert.ok(list.some((e) => e.path === "main.tex" && e.kind === "file"));
    const read = await readWorkspaceFile(dir, "main.tex", 10);
    assert.equal(read.truncated, true);
    await fs.promises.writeFile(path.join(dir, "project.md"), "# Thesis\nUse latexmk.\n");
    const instr = await readProjectInstructions(dir);
    assert.equal(instr.path, "project.md");
    assert.ok(instr.text.includes("latexmk"));
  });

  it("statFile hashes content", async () => {
    const s = await statFile(dir, "notes.md");
    assert.equal(s.exists, true);
    assert.match(s.hash, /^[0-9a-f]{64}$/);
  });

  it("chat writes validate, snapshot first, and undo restores", async () => {
    const out = await writeWorkspaceFiles(dir, "chat-t1", [
      { path: "chapter3.tex", text: "\\section{New}\n" },
      { path: "main.tex", text: "\\documentclass{article}\nUpdated\n" },
    ]);
    assert.equal(out.written.length, 2);
    assert.equal(await fs.promises.readFile(path.join(dir, "chapter3.tex"), "utf8"), "\\section{New}\n");
    // Snapshot-before-write captured the before-state: undo restores it.
    const undone = await undoWorkspace("chat-t1", ["main.tex", "chapter3.tex"]);
    assert.deepEqual([...undone.restored].sort(), ["chapter3.tex", "main.tex"]);
    assert.equal(
      await fs.promises.readFile(path.join(dir, "main.tex"), "utf8"),
      "\\documentclass{article}\n\\begin{document}\nHi\n\\end{document}\n"
    );
    await assert.rejects(() => fs.promises.stat(path.join(dir, "chapter3.tex")), /ENOENT/);
  });

  it("chat writes reject traversal, bad extensions, oversize content", async () => {
    await assert.rejects(() => writeWorkspaceFiles(dir, "chat-t1b", [{ path: "../evil.tex", text: "x" }]), /escapes/);
    await assert.rejects(
      () => writeWorkspaceFiles(dir, "chat-t1b", [{ path: "/abs.tex", text: "x" }]),
      /escapes|Invalid/
    );
    await assert.rejects(() => writeWorkspaceFiles(dir, "chat-t1b", [{ path: "run.sh", text: "x" }]), /extension/);
    await assert.rejects(
      () => writeWorkspaceFiles(dir, "chat-t1b", [{ path: "big.tex", text: "x".repeat(257 * 1024) }]),
      /too large/i
    );
    await assert.rejects(() => writeWorkspaceFiles(dir, "chat-t1b", []), /No files/);
  });

  it("write proposes HIGH-risk approval; deny leaves files unchanged, allow writes", async () => {
    const ctx = await makeTempUserData();
    try {
      const { registerWorkspaceIpc } = await import("./workspaceService.mjs");
      const handlers = new Map();
      const ipc = { handle: (c, fn) => handlers.set(c, fn) };
      registerWorkspaceIpc(ipc, ctx.app);
      const invoke = (c, ...a) => handlers.get(c)({}, ...a);
      const before = await fs.promises.readFile(path.join(dir, "main.tex"), "utf8");
      // Deny path.
      const prop = await invoke("workspace:write", {
        root: dir,
        taskKey: "chat-t3",
        files: [{ path: "main.tex", text: "CHANGED\n" }],
      });
      assert.equal(prop.status, "needs-approval");
      assert.ok(prop.approvalId);
      const denied = await invoke("workspace:writeConfirm", { approvalId: prop.approvalId, decision: "deny" });
      assert.equal(denied.status, "rejected");
      assert.equal(await fs.promises.readFile(path.join(dir, "main.tex"), "utf8"), before);
      // Allow path writes the FROZEN proposed content.
      const prop2 = await invoke("workspace:write", {
        root: dir,
        taskKey: "chat-t3",
        files: [{ path: "main.tex", text: "CHANGED\n" }],
      });
      const done = await invoke("workspace:writeConfirm", { approvalId: prop2.approvalId, decision: "allow" });
      assert.equal(done.status, "written");
      assert.equal(done.written[0].path, "main.tex");
      assert.equal(await fs.promises.readFile(path.join(dir, "main.tex"), "utf8"), "CHANGED\n");
      // Replay of a consumed approval fails closed.
      await assert.rejects(
        invoke("workspace:writeConfirm", { approvalId: prop2.approvalId, decision: "allow" }),
        /not found|consumed|approved|Invalid|failed/i
      );
      // Malicious propose is rejected before any approval exists.
      await assert.rejects(
        invoke("workspace:write", { root: dir, taskKey: "chat-t4", files: [{ path: "../x.tex", text: "x" }] }),
        /escapes/
      );
    } finally {
      closeDb();
      await ctx.cleanup();
    }
  });

  it("undo proposes HIGH-risk approval and restores only on allow", async () => {
    const ctx = await makeTempUserData();
    try {
      const { registerWorkspaceIpc } = await import("./workspaceService.mjs");
      const handlers = new Map();
      const ipc = { handle: (c, fn) => handlers.set(c, fn) };
      registerWorkspaceIpc(ipc, ctx.app);
      const invoke = (c, ...a) => handlers.get(c)({}, ...a);
      await invoke("workspace:snapshot", { root: dir, taskKey: "undo-t", files: ["notes.md"] });
      await fs.promises.writeFile(path.join(dir, "notes.md"), "# changed\n");
      const prop = await invoke("workspace:undo", { taskKey: "undo-t", files: ["notes.md"] });
      assert.equal(prop.status, "needs-approval");
      assert.ok(prop.approvalId);
      // Deny path: files unchanged.
      const denied = await invoke("workspace:undoConfirm", { approvalId: prop.approvalId, decision: "deny" });
      assert.equal(denied.status, "rejected");
      assert.equal(await fs.promises.readFile(path.join(dir, "notes.md"), "utf8"), "# changed\n");
      // Allow path: single-use grant restores.
      const prop2 = await invoke("workspace:undo", { taskKey: "undo-t", files: ["notes.md"] });
      const done = await invoke("workspace:undoConfirm", { approvalId: prop2.approvalId, decision: "allow" });
      assert.equal(done.status, "restored");
      assert.equal(await fs.promises.readFile(path.join(dir, "notes.md"), "utf8"), "# notes\n");
      // Replay fails closed (single-use).
      await assert.rejects(
        invoke("workspace:undoConfirm", { approvalId: prop2.approvalId, decision: "allow" }),
        /not found|consumed|approved|Invalid|failed/i,
      );
    } finally {
      closeDb();
      await ctx.cleanup();
    }
  });

  it("detectGit returns null outside a repo, status inside", async () => {
    assert.equal(await detectGit(dir), null);
    const repo = await fs.promises.mkdtemp(path.join(os.tmpdir(), "openbentt-git-"));
    try {
      const { execFile } = await import("node:child_process");
      const run = (args) => new Promise((res, rej) => execFile("git", args, { cwd: repo }, (e) => (e ? rej(e) : res())));
      await run(["init", "-q"]);
      await run(["config", "user.email", "t@t"]);
      await run(["config", "user.name", "t"]);
      await fs.promises.writeFile(path.join(repo, "a.txt"), "x");
      await run(["add", "."]);
      await run(["commit", "-qm", "init"]);
      await fs.promises.writeFile(path.join(repo, "a.txt"), "y");
      const g = await detectGit(repo);
      assert.ok(g && typeof g.branch === "string");
      assert.ok(g.modified.includes("a.txt"));
    } finally {
      await fs.promises.rm(repo, { recursive: true, force: true }).catch(() => {});
    }
  });
});
