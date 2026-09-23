/**
 * Workspace authority (Electron main only).
 *
 * Canonical ProjectWorkspace resolution + verification + watching + real
 * diffs. The filesystem is authoritative for project files; renderers never
 * construct paths independently. All paths: lexical check + realpath
 * containment + symlink-escape fail-closed.
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { createLogger } from "./log.mjs";

const require = createRequire(import.meta.url);
const { createTwoFilesPatch } = require("diff");

const log = createLogger("workspace");

const MAX_LIST_ENTRIES = 500;
const MAX_READ_BYTES = 256 * 1024;
const MAX_SNAPSHOT_FILES = 100;
const MAX_SNAPSHOT_BYTES = 512 * 1024;
const WATCH_DEBOUNCE_MS = 750;

let eventTarget = null;
export function setWorkspaceEventTarget(win) {
  eventTarget = win ?? null;
}

function emit(channel, payload) {
  try {
    eventTarget?.webContents?.send(channel, payload);
  } catch { /* window may be gone */ }
}

/* ---------------- path authority ---------------- */

function checkLexical(root, candidate) {
  const norm = (p) => String(p ?? "").replace(/\\/g, "/").replace(/\/+$/, "");
  const r = norm(root);
  const c = norm(candidate);
  if (!c || !(c === r || c.startsWith(`${r}/`)) || c.includes("..")) {
    throw new Error("Path escapes workspace");
  }
}

/** Canonicalize + verify containment (symlink escapes fail closed). */
export async function resolveWorkspaceRoot(input) {
  const raw = String(input ?? "").trim();
  if (!raw || raw.length > 4096) throw new Error("Invalid workspace");
  if (raw.includes("\0")) throw new Error("Invalid workspace");
  let real;
  try {
    real = await fsp.realpath(raw);
  } catch {
    throw new Error("Workspace does not exist");
  }
  const st = await fsp.stat(real).catch(() => null);
  if (!st?.isDirectory()) throw new Error("Workspace is not a directory");
  return real;
}

export async function resolveInWorkspace(root, relOrAbs) {
  const rootReal = await resolveWorkspaceRoot(root);
  const candidate = path.isAbsolute(String(relOrAbs ?? ""))
    ? String(relOrAbs)
    : path.join(rootReal, String(relOrAbs ?? ""));
  checkLexical(rootReal, candidate);
  let real;
  try {
    real = await fsp.realpath(candidate);
  } catch {
    // Missing paths: verify the parent chain stays inside.
    const parent = path.dirname(candidate);
    checkLexical(rootReal, parent);
    try {
      const realParent = await fsp.realpath(parent);
      checkLexical(rootReal, realParent);
      checkLexical(rootReal, path.join(realParent, path.basename(candidate)));
    } catch {
      throw new Error("Path escapes workspace");
    }
    return { root: rootReal, abs: candidate, rel: path.relative(rootReal, candidate), exists: false };
  }
  checkLexical(rootReal, real);
  return { root: rootReal, abs: real, rel: path.relative(rootReal, real), exists: true };
}

/* ---------------- stat / verify ---------------- */

export async function statFile(root, rel) {
  const { abs, rel: relPath, exists } = await resolveInWorkspace(root, rel);
  if (!exists) return { path: relPath, exists: false, size: 0, hash: "", mtimeMs: 0 };
  const st = await fsp.stat(abs);
  if (!st.isFile()) return { path: relPath, exists: false, size: 0, hash: "", mtimeMs: 0 };
  const hash = crypto.createHash("sha256");
  const stream = fs.createReadStream(abs);
  await new Promise((resolve, reject) => {
    stream.on("data", (d) => hash.update(d));
    stream.on("end", resolve);
    stream.on("error", reject);
  });
  return { path: relPath, exists: true, size: st.size, hash: hash.digest("hex"), mtimeMs: st.mtimeMs };
}

/**
 * Verify claimed file changes against real filesystem state.
 * `claims: [{path, existedBefore}]` → verified list with actual stat.
 * Never trusts agent text: existence + hash + size come from disk.
 */
export async function verifyFiles(root, claims = []) {
  const out = [];
  for (const c of claims.slice(0, MAX_SNAPSHOT_FILES)) {
    const rel = typeof c?.path === "string" ? c.path : "";
    if (!rel) continue;
    try {
      const v = await statFile(root, rel);
      out.push({ ...v, changed: Boolean(c?.existedBefore) ? true : v.exists });
    } catch {
      out.push({ path: rel, exists: false, size: 0, hash: "", mtimeMs: 0, changed: false, error: "unresolvable" });
    }
  }
  return out;
}

/* ---------------- list / read ---------------- */

const IGNORED = new Set(["node_modules", ".git", ".hg", ".svn", "__pycache__", ".venv", "dist", "build", ".next", "target"]);

export async function listWorkspace(root, relDir = ".", depth = 2) {
  const { abs } = await resolveInWorkspace(root, relDir);
  const out = [];
  async function walk(dir, rel, d) {
    if (out.length >= MAX_LIST_ENTRIES) return;
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (out.length >= MAX_LIST_ENTRIES) break;
      if (e.name.startsWith(".") && e.name !== ".openbentt") {
        if (IGNORED.has(e.name)) continue;
      }
      if (IGNORED.has(e.name)) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        out.push({ path: r, kind: "dir" });
        if (d > 1) await walk(path.join(dir, e.name), r, d - 1);
      } else if (e.isFile()) {
        out.push({ path: r, kind: "file" });
      }
    }
  }
  await walk(abs, relDir === "." ? "" : String(relDir), Math.max(1, Math.min(4, depth)));
  return out.slice(0, MAX_LIST_ENTRIES);
}

export async function readWorkspaceFile(root, rel, maxBytes = MAX_READ_BYTES) {
  const { abs, rel: relPath } = await resolveInWorkspace(root, rel);
  const st = await fsp.stat(abs).catch(() => null);
  if (!st?.isFile()) throw new Error("Not a file");
  const n = Math.max(1, Math.min(MAX_READ_BYTES, maxBytes));
  const fh = await fsp.open(abs, "r");
  try {
    const buf = Buffer.alloc(Math.min(n + 1, st.size + 1));
    const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
    return { path: relPath, text: buf.slice(0, Math.min(bytesRead, n)).toString("utf8"), truncated: bytesRead > n, size: st.size };
  } finally {
    await fh.close().catch(() => {});
  }
}

/* ---------------- project context ---------------- */

export async function readProjectInstructions(root) {
  for (const rel of ["project.md", ".openbentt/project.md"]) {
    try {
      const { text } = await readWorkspaceFile(root, rel, 8192);
      if (text.trim()) return { path: rel, text: text.slice(0, 8192) };
    } catch { /* next */ }
  }
  return { path: null, text: null };
}

export async function detectGit(root) {
  const rootReal = await resolveWorkspaceRoot(root);
  const run = (args) => new Promise((resolve) => {
    execFile("git", args, { cwd: rootReal, timeout: 8000, windowsHide: true }, (err, stdout) => {
      resolve(err ? null : String(stdout ?? ""));
    });
  });
  const branch = (await run(["rev-parse", "--abbrev-ref", "HEAD"]))?.trim();
  if (!branch) return null;
  const status = (await run(["status", "--porcelain=v1", "-uall"])) ?? "";
  const modified = [];
  const untracked = [];
  for (const line of status.split("\n").slice(0, 200)) {
    if (line.length < 4) continue;
    const p = line.slice(3).trim();
    if (!p) continue;
    if (line.startsWith("??")) untracked.push(p);
    else modified.push(p);
  }
  return { branch, modified: modified.slice(0, 100), untracked: untracked.slice(0, 100) };
}

/* ---------------- snapshots / real diffs / undo ---------------- */

/** taskKey -> Map<rel, {hash, text|null}> (text bounded, binaries hash-only). */
const snapshots = new Map();

export async function snapshotWorkspace(root, taskKey, rels = []) {
  const rootReal = await resolveWorkspaceRoot(root);
  // Merge into any existing snapshot (captures before-state lazily as the
  // task touches files; first write wins).
  const existing = snapshots.get(String(taskKey));
  const sameRoot = existing && existing.root === rootReal ? existing : null;
  const snap = sameRoot ? sameRoot.files : new Map();
  let bytes = [...snap.values()].reduce((n, f) => n + (f.text?.length ?? 0), 0);
  for (const rel of rels.slice(0, MAX_SNAPSHOT_FILES)) {
    try {
      const v = await statFile(rootReal, rel);
      if (snap.has(v.path)) continue;
      let text = null;
      if (v.exists && v.size <= 128 * 1024) {
        const r = await readWorkspaceFile(rootReal, rel, 128 * 1024);
        // Skip binaries (NUL byte heuristic).
        if (!r.text.includes("\0")) {
          text = r.text;
          bytes += text.length;
          if (bytes > MAX_SNAPSHOT_BYTES) break;
        }
      }
      snap.set(v.path, { hash: v.hash, text, existed: v.exists });
    } catch { /* skip */ }
  }
  snapshots.set(String(taskKey), { root: rootReal, files: snap, at: sameRoot?.at ?? Date.now() });
  if (snapshots.size > 20) {
    const first = snapshots.keys().next().value;
    snapshots.delete(first);
  }
  return { files: snap.size };
}

export async function diffWorkspace(taskKey) {
  const snap = snapshots.get(String(taskKey));
  if (!snap) throw new Error("No snapshot for task");
  const diffs = [];
  for (const [rel, before] of snap.files) {
    const after = await statFile(snap.root, rel).catch(() => null);
    const afterHash = after?.hash ?? "";
    if (afterHash === before.hash) continue;
    let afterText = "";
    if (after?.exists && after.size <= 128 * 1024) {
      try {
        const r = await readWorkspaceFile(snap.root, rel, 128 * 1024);
        if (!r.text.includes("\0")) afterText = r.text;
      } catch { /* binary/unreadable */ }
    }
    const beforeText = before.text ?? "";
    if (beforeText === "" && afterText === "") {
      diffs.push({ path: rel, added: 0, removed: 0, binary: true, patch: "" });
      continue;
    }
    let patch = "";
    try {
      patch = createTwoFilesPatch(`a/${rel}`, `b/${rel}`, beforeText, afterText).slice(0, 20000);
    } catch {
      patch = "";
    }
    const added = (patch.match(/^\+[^+]/gm) ?? []).length;
    const removed = (patch.match(/^-[^-]/gm) ?? []).length;
    diffs.push({ path: rel, added, removed, binary: false, patch });
  }
  // New files (not in snapshot) are reported when the caller passes them via
  // snapshot extras; full tree scan is intentionally avoided (bounded).
  return diffs.slice(0, MAX_SNAPSHOT_FILES);
}

/** Restore snapshot content (caller must hold a WRITE_FILES grant). */
export async function undoWorkspace(taskKey, rels = []) {
  const snap = snapshots.get(String(taskKey));
  if (!snap) throw new Error("No snapshot for task");
  const restored = [];
  const wanted = rels.length ? new Set(rels) : null;
  for (const [rel, before] of snap.files) {
    if (wanted && !wanted.has(rel)) continue;
    if (before.text === null && before.existed) continue; // binary/large: hash-only
    try {
      const { abs } = await resolveInWorkspace(snap.root, rel);
      if (!before.existed) {
        await fsp.rm(abs, { force: true });
        restored.push(rel);
      } else {
        await fsp.mkdir(path.dirname(abs), { recursive: true });
        await fsp.writeFile(abs, before.text ?? "", "utf8");
        restored.push(rel);
      }
    } catch { /* best effort per file */ }
  }
  return { restored };
}

/* ---------------- watcher ---------------- */

/** rootReal -> { watcher, timer, lastSent } */
const watchers = new Map();

function watchedPayload(rootReal, rels) {
  return { root: rootReal, changed: rels.slice(0, 100), at: new Date().toISOString() };
}

export async function watchWorkspace(root) {
  const rootReal = await resolveWorkspaceRoot(root);
  if (watchers.has(rootReal)) return { watching: true, root: rootReal };
  let watcher;
  try {
    watcher = fs.watch(rootReal, { recursive: true });
  } catch (err) {
    throw new Error(`Cannot watch workspace: ${err instanceof Error ? err.message : "unknown"}`);
  }
  const state = { watcher, timer: null, pending: new Set() };
  watcher.on("change", (_event, filename) => {
    const rel = String(filename ?? "").replace(/\\/g, "/").slice(0, 512);
    if (!rel) return;
    const top = rel.split("/")[0];
    if (IGNORED.has(top)) return;
    state.pending.add(rel);
    if (state.timer) clearTimeout(state.timer);
    state.timer = setTimeout(() => {
      const rels = [...state.pending];
      state.pending.clear();
      state.timer = null;
      emit("workspace:files-changed", watchedPayload(rootReal, rels));
    }, WATCH_DEBOUNCE_MS);
  });
  watcher.on("error", () => {
    unwatchWorkspace(rootReal).catch(() => {});
  });
  watchers.set(rootReal, state);
  return { watching: true, root: rootReal };
}

export async function unwatchWorkspace(root) {
  const rootReal = typeof root === "string" && path.isAbsolute(root) ? root : await resolveWorkspaceRoot(root).catch(() => null);
  if (!rootReal) return { watching: false };
  const state = watchers.get(rootReal);
  if (!state) return { watching: false };
  if (state.timer) clearTimeout(state.timer);
  try {
    state.watcher.close();
  } catch { /* noop */ }
  watchers.delete(rootReal);
  return { watching: false };
}

export function cleanupWorkspaceOnQuit() {
  for (const [, state] of watchers) {
    try {
      if (state.timer) clearTimeout(state.timer);
      state.watcher.close();
    } catch { /* noop */ }
  }
  watchers.clear();
}

/* ---------------- undo via the ONE approval authority ---------------- */

const UNDO_TOOL_ID = "workspace.undo";

async function proposeUndo(app, taskKey, files) {
  const { proposeAction, listApprovals } = await import("./actionStore.mjs");
  const { actionFingerprint, newIdempotencyKey } = await import("../src/lib/actions/actionCore.mjs");
  const snap = snapshots.get(String(taskKey));
  if (!snap) throw new Error("No snapshot for task");
  const targets = Array.isArray(files) && files.length ? files.slice(0, 100) : [...snap.files.keys()];
  const fingerprint = actionFingerprint(UNDO_TOOL_ID, undefined, {
    workspace: snap.root,
    files: [...targets].sort(),
  });
  const existing = listApprovals(app, { status: "proposed" }).find(
    (a) => a.fingerprint === fingerprint && a.toolId === UNDO_TOOL_ID,
  );
  const approval = existing ?? proposeAction(app, {
    toolId: UNDO_TOOL_ID,
    projectId: undefined,
    runId: String(taskKey),
    requestId: `undo_${Date.now()}`,
    input: { workspace: snap.root, files: [...targets].sort(), idempotencyKey: newIdempotencyKey() },
    risk: "HIGH",
  });
  return { approval, targets, root: snap.root };
}

/* ---------------- IPC ---------------- */

function assertPayload(p) {
  if (!p || typeof p !== "object") throw new Error("Invalid payload");
  return p;
}

export function registerWorkspaceIpc(ipcMain, app) {
  void app;
  ipcMain.handle("workspace:resolve", async (_e, payload) => {
    const p = assertPayload(payload);
    const root = await resolveWorkspaceRoot(p.root);
    return { root };
  });
  ipcMain.handle("workspace:list", async (_e, payload) => {
    const p = assertPayload(payload);
    return listWorkspace(p.root, p.dir ?? ".", p.depth ?? 2);
  });
  ipcMain.handle("workspace:read", async (_e, payload) => {
    const p = assertPayload(payload);
    if (typeof p.path !== "string" || !p.path) throw new Error("Invalid path");
    return readWorkspaceFile(p.root, p.path, p.maxBytes ?? MAX_READ_BYTES);
  });
  ipcMain.handle("workspace:verify", async (_e, payload) => {
    const p = assertPayload(payload);
    const root = await resolveWorkspaceRoot(p.root);
    return verifyFiles(root, Array.isArray(p.claims) ? p.claims : []);
  });
  ipcMain.handle("workspace:instructions", async (_e, payload) => {
    const p = assertPayload(payload);
    const root = await resolveWorkspaceRoot(p.root);
    return readProjectInstructions(root);
  });
  ipcMain.handle("workspace:git", async (_e, payload) => {
    const p = assertPayload(payload);
    const root = await resolveWorkspaceRoot(p.root);
    return detectGit(root);
  });
  ipcMain.handle("workspace:snapshot", async (_e, payload) => {
    const p = assertPayload(payload);
    if (typeof p.taskKey !== "string" || !p.taskKey) throw new Error("Invalid task");
    const root = await resolveWorkspaceRoot(p.root);
    return snapshotWorkspace(root, p.taskKey, Array.isArray(p.files) ? p.files : []);
  });
  ipcMain.handle("workspace:diff", async (_e, payload) => {
    const p = assertPayload(payload);
    if (typeof p.taskKey !== "string" || !p.taskKey) throw new Error("Invalid task");
    return diffWorkspace(p.taskKey);
  });
  // Undo = propose (HIGH risk) then confirm. Same actionStore authority as
  // OpenCode permissions — no second system. Renderer never executes.
  ipcMain.handle("workspace:undo", async (_e, payload) => {
    const p = assertPayload(payload);
    if (typeof p.taskKey !== "string" || !p.taskKey) throw new Error("Invalid task");
    const { approval, targets } = await proposeUndo(app, p.taskKey, p.files);
    return {
      approvalId: approval.id,
      fingerprint: approval.fingerprint,
      files: targets,
      status: "needs-approval",
    };
  });
  ipcMain.handle("workspace:undoConfirm", async (_e, payload) => {
    const p = assertPayload(payload);
    if (typeof p.approvalId !== "string" || !p.approvalId) throw new Error("Invalid approval");
    const { approveAction, rejectAction, consumeApprovalForExecution, getApproval } =
      await import("./actionStore.mjs");
    if (p.decision !== "allow") {
      try {
        rejectAction(app, p.approvalId);
      } catch { /* already settled */ }
      return { status: "rejected" };
    }
    const approval = getApproval(app, p.approvalId);
    if (!approval) throw new Error("Approval not found");
    approveAction(app, p.approvalId);
    const snap = snapshots.get(String(approval.runId));
    const consumed = consumeApprovalForExecution(app, p.approvalId, {
      toolId: UNDO_TOOL_ID,
      projectId: approval.projectId,
      runId: approval.runId,
      input: approval.input,
    });
    void consumed;
    const restored = await undoWorkspace(approval.runId, snap ? [...snap.files.keys()] : []);
    return { status: "restored", ...restored };
  });
  ipcMain.handle("workspace:watch", async (_e, payload) => {
    const p = assertPayload(payload);
    return watchWorkspace(p.root);
  });
  ipcMain.handle("workspace:unwatch", async (_e, payload) => {
    const p = assertPayload(payload);
    return unwatchWorkspace(p.root);
  });
}

/* ---------------- test hooks ---------------- */

export const __testHooks = {
  reset() {
    for (const [, state] of watchers) {
      try {
        if (state.timer) clearTimeout(state.timer);
        state.watcher.close();
      } catch { /* noop */ }
    }
    watchers.clear();
    snapshots.clear();
  },
};
