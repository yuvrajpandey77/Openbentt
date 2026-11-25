import { describe, it, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import fsPromises from "node:fs/promises";
import {
  backupDatabase,
  closeDb,
  createSnapshot,
  flushPersistence,
  flushScheduledBackup,
  getDb,
  getPersistenceError,
  getPersistenceStatus,
  openDb,
  retryPersistence,
  listSnapshots,
  loadProject,
  migrateLegacyProjects,
  patchDraft,
  projectDir,
  projectsRoot,
  restoreSnapshot,
  saveProjectMeta,
  scheduleBackupDatabase,
} from "./researchDb.mjs";

function mockApp(root) {
  return {
    getPath: () => root,
  };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

/** Patch the synchronous write primitive used by the atomic persistence path. */
function patchWriteSync(impl) {
  const original = fs.writeSync;
  fs.writeSync = function (...args) {
    return impl(original, this, args);
  };
  return () => {
    fs.writeSync = original;
  };
}

function projectData(id, overrides = {}) {
  return {
    id,
    title: id,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    targetVenue: "generic",
    linkedThreadIds: [],
    draftTex: "initial",
    bibliography: "",
    papers: [],
    chunks: [],
    revisionSuggestions: [],
    modelAttributions: [],
    abstractVariants: [],
    keywordSuggestions: [],
    ...overrides,
  };
}

function assertFailedStatus(status, matcher) {
  assert.equal(status.state, "failed");
  assert.equal(status.hasUnsavedChanges, true);
  assert.ok(status.lastAttemptAt, "expected lastAttemptAt on a failed write");
  assert.match(status.lastError ?? "", matcher);
  assert.match(getPersistenceError() ?? "", matcher);
}

function isSqliteBytes(buffer) {
  return buffer.subarray(0, 16).toString("latin1") === "SQLite format 3\u0000";
}

describe("researchDb desktop storage", () => {
  let tmpRoot;
  let app;

  before(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "openbentt-research-test-"));
    app = mockApp(tmpRoot);
  });

  afterEach(async () => {
    // Force-close so a failed fault-injection case can never leak in-memory
    // state or retry timers into the next subtest.
    await closeDb(true);
  });

  after(async () => {
    await closeDb(true);
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("patchDraft updates only draft row (not full corpus rebuild)", () => {
    const id = "test-proj-1";
    saveProjectMeta(app, {
      id,
      title: "Thesis",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      targetVenue: "generic",
      linkedThreadIds: [],
      draftTex: "initial",
      bibliography: "",
      papers: [],
      chunks: [{ id: "c1", paperId: "draft", text: "chunk stays" }],
      revisionSuggestions: [],
      modelAttributions: [],
      abstractVariants: [],
      keywordSuggestions: [],
    });

    patchDraft(app, id, "keystroke edit");
    const loaded = loadProject(app, id);
    assert.equal(loaded.draftTex, "keystroke edit");
    assert.equal(loaded.chunks.length, 1);
    assert.equal(loaded.chunks[0].text, "chunk stays");
  });

  it("snapshot and restore round-trip", () => {
    const id = "test-proj-2";
    saveProjectMeta(app, {
      id,
      title: "Snap",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      targetVenue: "generic",
      linkedThreadIds: [],
      draftTex: "before snap",
      bibliography: "",
      papers: [],
      chunks: [],
      revisionSuggestions: [],
      modelAttributions: [],
      abstractVariants: [],
      keywordSuggestions: [],
    });

    const snap = createSnapshot(app, id, "test");
    assert.ok(snap?.id);

    patchDraft(app, id, "after snap");
    assert.equal(loadProject(app, id).draftTex, "after snap");

    const restored = restoreSnapshot(app, snap.id);
    assert.equal(restored.draftTex, "before snap");

    const listed = listSnapshots(app, id);
    assert.ok(listed.some((s) => s.id === snap.id));
  });

  it("imports legacy project.json once", async () => {
    const legacyId = "legacy-proj";
    const dir = projectDir(app, legacyId);
    await fsPromises.mkdir(dir, { recursive: true });
    await fsPromises.writeFile(
      path.join(dir, "project.json"),
      JSON.stringify({
        id: legacyId,
        title: "Legacy JSON",
        createdAt: "2023-06-01T00:00:00.000Z",
        updatedAt: "2023-06-02T00:00:00.000Z",
        draftTex: "\\title{Legacy}",
        bibliography: "",
        papers: [],
        chunks: [],
      }),
      "utf8"
    );

    const { migrated } = await migrateLegacyProjects(app);
    assert.equal(migrated, 1);
    assert.equal(loadProject(app, legacyId)?.title, "Legacy JSON");
    assert.equal(fs.existsSync(path.join(dir, "project.json.legacy")), true);
  });

  it("auto-recovers from backup when db file is corrupt on open", async () => {
    const isoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "openbentt-auto-recover-"));
    const isoApp = mockApp(isoRoot);
    const id = "auto-recover";
    try {
      saveProjectMeta(isoApp, {
        id,
        title: "Auto Recover",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
        targetVenue: "generic",
        linkedThreadIds: [],
        draftTex: "saved",
        bibliography: "",
        papers: [],
        chunks: [],
        revisionSuggestions: [],
        modelAttributions: [],
        abstractVariants: [],
        keywordSuggestions: [],
      });
      backupDatabase(isoApp);
      closeDb();

      const dbFile = path.join(projectsRoot(isoApp), "research.db");
      await fsPromises.writeFile(dbFile, "NOT-SQLITE", "utf8");

      closeDb();
      assert.equal(loadProject(isoApp, id)?.title, "Auto Recover");
    } finally {
      closeDb();
      fs.rmSync(isoRoot, { recursive: true, force: true });
    }
  });

  it("backup file restores project after manual replace of corrupt db", async () => {
    const isoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "openbentt-recover-"));
    const isoApp = mockApp(isoRoot);
    const id = "recover-me";
    try {
      saveProjectMeta(isoApp, {
        id,
        title: "Recover",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
        targetVenue: "generic",
        linkedThreadIds: [],
        draftTex: "ok",
        bibliography: "",
        papers: [],
        chunks: [],
        revisionSuggestions: [],
        modelAttributions: [],
        abstractVariants: [],
        keywordSuggestions: [],
      });
      backupDatabase(isoApp);
      closeDb();

      const dbFile = path.join(projectsRoot(isoApp), "research.db");
      const bakFile = path.join(projectsRoot(isoApp), "research.db.bak");
      assert.ok(fs.statSync(bakFile).size > 500);
      await fsPromises.writeFile(dbFile, "CORRUPT", "utf8");
      await fsPromises.copyFile(bakFile, dbFile);

      closeDb();
      assert.equal(loadProject(isoApp, id)?.title, "Recover");
    } finally {
      closeDb();
      fs.rmSync(isoRoot, { recursive: true, force: true });
    }
  });

  it("permission denied (EACCES) is contained, reported, and recoverable", async () => {
    // The suspected full-app-quit path: persistence runs in process.nextTick.
    // A throw there must never terminate Electron or be reported as success.
    const id = "persist-failure";
    saveProjectMeta(app, projectData(id, { title: "Persist Failure", draftTex: "in memory" }));
    await tick();

    const restore = patchWriteSync(() => {
      const error = new Error("simulated persistence EACCES");
      error.code = "EACCES";
      throw error;
    });
    try {
      patchDraft(app, id, "unwritable edit");
      await tick();
      assertFailedStatus(getPersistenceStatus(), /simulated persistence EACCES/);
      // The in-memory database remains usable even though the write failed.
      assert.equal(loadProject(app, id)?.draftTex, "unwritable edit");
    } finally {
      restore();
    }

    const recovered = await retryPersistence();
    assert.equal(recovered.state, "clean");
    assert.equal(recovered.hasUnsavedChanges, false);
    assert.equal(getPersistenceError(), null);
    assert.equal(loadProject(app, id)?.draftTex, "unwritable edit");
  });

  it("disk full (ENOSPC) leaves failed state and does not replace the DB", async () => {
    const id = "persist-enospc";
    saveProjectMeta(app, projectData(id, { title: "ENOSPC", draftTex: "before" }));
    await tick();
    const dbFile = path.join(projectsRoot(app), "research.db");
    const bytesBefore = fs.readFileSync(dbFile);
    const successAt = getPersistenceStatus().lastSuccessAt;

    const restore = patchWriteSync(() => {
      const error = new Error("simulated disk full ENOSPC");
      error.code = "ENOSPC";
      throw error;
    });
    try {
      patchDraft(app, id, "after");
      await tick();
      const status = getPersistenceStatus();
      assertFailedStatus(status, /simulated disk full ENOSPC/);
      assert.equal(status.lastSuccessAt, successAt, "a failed write must not advance lastSuccessAt");
      assert.deepEqual(fs.readFileSync(dbFile), bytesBefore, "old DB must remain intact");

      const flushed = await flushPersistence(20);
      assert.equal(flushed.state, "failed");
      assert.equal(flushed.hasUnsavedChanges, true);
      assert.match(getPersistenceError() ?? "", /simulated disk full ENOSPC/);
    } finally {
      restore();
    }

    const recovered = await retryPersistence();
    assert.equal(recovered.state, "clean");
    assert.equal(recovered.hasUnsavedChanges, false);
    assert.equal(loadProject(app, id)?.draftTex, "after");
  });

  it("interrupted partial temp write is cleaned up and never replaces the DB", async () => {
    const id = "partial-write";
    saveProjectMeta(app, projectData(id, { draftTex: "good" }));
    await tick();
    const dbFile = path.join(projectsRoot(app), "research.db");
    const bytesBefore = fs.readFileSync(dbFile);

    const restore = patchWriteSync((original, ctx, args) => {
      const [, buffer, offset, length] = args;
      original.call(ctx, args[0], buffer, offset, Math.max(1, Math.floor(length / 2)));
      throw new Error("simulated interrupted write");
    });
    try {
      patchDraft(app, id, "partial");
      await tick();
      assertFailedStatus(getPersistenceStatus(), /simulated interrupted write/);
      assert.deepEqual(fs.readFileSync(dbFile), bytesBefore);
      assert.deepEqual(
        fs.readdirSync(projectsRoot(app)).filter((name) => name.endsWith(".tmp")),
        [],
        "partial temp files must be cleaned up"
      );
    } finally {
      restore();
    }

    const recovered = await retryPersistence();
    assert.equal(recovered.state, "clean");
    assert.ok(isSqliteBytes(fs.readFileSync(dbFile)));
    assert.equal(loadProject(app, id)?.draftTex, "partial");
  });

  it("invalid SQLite export is rejected before the DB is replaced", async () => {
    const id = "invalid-export";
    saveProjectMeta(app, projectData(id, { draftTex: "good" }));
    await tick();
    const dbFile = path.join(projectsRoot(app), "research.db");
    const bytesBefore = fs.readFileSync(dbFile);
    const db = getDb(app);
    const originalExport = db.export;
    db.export = () => new Uint8Array(Buffer.from("NOT-A-SQLITE-DB"));
    try {
      patchDraft(app, id, "bad export");
      await tick();
      assertFailedStatus(getPersistenceStatus(), /invalid SQLite database export/);
      assert.deepEqual(fs.readFileSync(dbFile), bytesBefore);
      assert.deepEqual(
        fs.readdirSync(projectsRoot(app)).filter((name) => name.endsWith(".tmp")),
        []
      );
    } finally {
      db.export = originalExport;
    }
    const recovered = await retryPersistence();
    assert.equal(recovered.state, "clean");
    assert.ok(isSqliteBytes(fs.readFileSync(dbFile)));
  });

  it("invalid database with valid backup recovers without consuming the backup", async () => {
    const isoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "openbentt-valid-backup-"));
    const isoApp = mockApp(isoRoot);
    const id = "valid-backup";
    try {
      saveProjectMeta(isoApp, projectData(id, { title: "Valid Backup" }));
      backupDatabase(isoApp);
      await closeDb();

      const dbFile = path.join(projectsRoot(isoApp), "research.db");
      const bakFile = path.join(projectsRoot(isoApp), "research.db.bak");
      const backupBytes = fs.readFileSync(bakFile);
      assert.ok(isSqliteBytes(backupBytes));
      await fsPromises.writeFile(dbFile, "NOT-SQLITE", "utf8");

      assert.equal(loadProject(isoApp, id)?.title, "Valid Backup");
      assert.deepEqual(fs.readFileSync(bakFile), backupBytes, "backup must be preserved");
      assert.equal(getPersistenceStatus().state, "clean");
      assert.equal(getPersistenceStatus().hasUnsavedChanges, false);
      assert.equal(getPersistenceError(), null);
    } finally {
      await closeDb();
      fs.rmSync(isoRoot, { recursive: true, force: true });
    }
  });

  it("corrupt backup with corrupt database reports failed (no fabricated recovery)", async () => {
    const isoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "openbentt-both-corrupt-"));
    const isoApp = mockApp(isoRoot);
    try {
      saveProjectMeta(isoApp, projectData("both-corrupt"));
      backupDatabase(isoApp);
      await closeDb();

      const dbFile = path.join(projectsRoot(isoApp), "research.db");
      const bakFile = path.join(projectsRoot(isoApp), "research.db.bak");
      await fsPromises.writeFile(dbFile, "CORRUPT-DB", "utf8");
      await fsPromises.writeFile(bakFile, "CORRUPT-BACKUP", "utf8");

      assert.throws(() => openDb(isoApp));
      const status = getPersistenceStatus();
      assert.equal(status.state, "failed");
      assert.match(status.lastError ?? "", /no valid backup/);
      assert.equal(getPersistenceError(), status.lastError);
    } finally {
      await closeDb();
      fs.rmSync(isoRoot, { recursive: true, force: true });
    }
  });

  it("shutdown during persistence keeps in-memory state and reports failure", async () => {
    const id = "shutdown-fail";
    saveProjectMeta(app, projectData(id, { draftTex: "before shutdown" }));
    await tick();
    const dbFile = path.join(projectsRoot(app), "research.db");
    const bytesBefore = fs.readFileSync(dbFile);
    const successAt = getPersistenceStatus().lastSuccessAt;

    const restore = patchWriteSync(() => {
      const error = new Error("simulated shutdown ENOSPC");
      error.code = "ENOSPC";
      throw error;
    });
    try {
      patchDraft(app, id, "dirty at shutdown");
      const status = await closeDb();
      assertFailedStatus(status, /simulated shutdown ENOSPC/);
      assert.equal(status.lastSuccessAt, successAt);
      assert.deepEqual(fs.readFileSync(dbFile), bytesBefore);
      // The in-memory database is still usable after a failed shutdown write.
      assert.equal(loadProject(app, id)?.draftTex, "dirty at shutdown");
    } finally {
      restore();
    }

    const recovered = await retryPersistence();
    assert.equal(recovered.state, "clean");
    assert.equal(loadProject(app, id)?.draftTex, "dirty at shutdown");
    await closeDb();
  });

  it("repeated persistence failures are bounded and never report success", async () => {
    const id = "repeat-fail";
    saveProjectMeta(app, projectData(id, { draftTex: "v0" }));
    await tick();

    const restore = patchWriteSync(() => {
      const error = new Error("simulated repeated failure");
      error.code = "EIO";
      throw error;
    });
    try {
      patchDraft(app, id, "v1");
      await tick();
      assertFailedStatus(getPersistenceStatus(), /simulated repeated failure/);
      for (const value of ["v2", "v3", "v4"]) patchDraft(app, id, value);
      await tick();

      const status = await flushPersistence(400);
      assert.equal(status.state, "failed");
      assert.equal(status.hasUnsavedChanges, true);
      assert.equal(status.retryCount, 3, "retryCount must be bounded");
      assert.match(status.lastError ?? "", /simulated repeated failure/);

      await flushPersistence(50);
      assert.equal(getPersistenceStatus().retryCount, 3, "no unbounded retry growth");
    } finally {
      restore();
    }

    const recovered = await retryPersistence();
    assert.equal(recovered.state, "clean");
    assert.equal(recovered.retryCount, 0);
    assert.equal(loadProject(app, id)?.draftTex, "v4");
  });

  it("concurrent modifications coalesce into one atomic write", async () => {
    const id = "coalesced";
    saveProjectMeta(app, projectData(id, { draftTex: "initial" }));
    await tick();
    const dbFile = path.join(projectsRoot(app), "research.db");
    const originalRename = fs.renameSync;
    let dbRenames = 0;
    fs.renameSync = function (...args) {
      if (String(args[1]) === dbFile) dbRenames += 1;
      return originalRename.apply(this, args);
    };
    try {
      patchDraft(app, id, "writer-a");
      patchDraft(app, id, "writer-b");
      patchDraft(app, id, "writer-c-final");
      assert.equal(getPersistenceStatus().state, "pending");
      assert.equal(getPersistenceStatus().hasUnsavedChanges, true);

      await tick();
      const status = await flushPersistence(100);
      assert.equal(dbRenames, 1, "mutations in one tick must coalesce into one write");
      assert.equal(status.state, "clean");
      assert.equal(status.hasUnsavedChanges, false);
      assert.deepEqual(
        fs.readdirSync(projectsRoot(app)).filter((name) => name.endsWith(".tmp")),
        []
      );
      await closeDb();
      assert.equal(loadProject(app, id)?.draftTex, "writer-c-final");
    } finally {
      fs.renameSync = originalRename;
    }
  });

  it("concurrent draft patches last-write wins", () => {
    const id = "concurrent-draft";
    saveProjectMeta(app, {
      id,
      title: "Concurrent",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
      targetVenue: "generic",
      linkedThreadIds: [],
      draftTex: "initial",
      bibliography: "",
      papers: [],
      chunks: [],
      revisionSuggestions: [],
      modelAttributions: [],
      abstractVariants: [],
      keywordSuggestions: [],
    });
    patchDraft(app, id, "writer-a");
    patchDraft(app, id, "writer-b-final");
    assert.equal(loadProject(app, id).draftTex, "writer-b-final");
  });

  it("schema v4 uses composite PK and project-scoped draft chunk IDs", () => {
    const a = "proj-a";
    const b = "proj-b";
    for (const id of [a, b]) {
      saveProjectMeta(app, {
        id,
        title: id,
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
        targetVenue: "generic",
        linkedThreadIds: [],
        draftTex: "draft body",
        bibliography: "",
        papers: [],
        chunks: [{ id: "draft-0", paperId: "draft", text: `chunk for ${id}` }],
        revisionSuggestions: [],
        modelAttributions: [],
        abstractVariants: [],
        keywordSuggestions: [],
      });
    }

    const row = getDb(app)
      .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='corpus_chunks'")
      .get();
    assert.match(row.sql, /PRIMARY KEY \(id, project_id\)/);

    const loadedA = loadProject(app, a);
    const loadedB = loadProject(app, b);
    assert.ok(loadedA.chunks.some((c) => c.id === `${a}:draft-0`));
    assert.ok(loadedB.chunks.some((c) => c.id === `${b}:draft-0`));
  });

  it("debounces backup until flush or snapshot", () => {
    const id = "backup-debounce";
    const bakFile = () => path.join(projectsRoot(app), "research.db.bak");
    saveProjectMeta(app, {
      id,
      title: "Debounce",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
      targetVenue: "generic",
      linkedThreadIds: [],
      draftTex: "v1",
      bibliography: "",
      papers: [],
      chunks: [],
      revisionSuggestions: [],
      modelAttributions: [],
      abstractVariants: [],
      keywordSuggestions: [],
    });
    flushScheduledBackup(app);
    assert.ok(fs.existsSync(bakFile()));
    const mtimeAfterFirst = fs.statSync(bakFile()).mtimeMs;

    for (let i = 0; i < 5; i++) scheduleBackupDatabase(app);
    assert.equal(fs.statSync(bakFile()).mtimeMs, mtimeAfterFirst);

    flushScheduledBackup(app);
    assert.ok(fs.statSync(bakFile()).mtimeMs >= mtimeAfterFirst);

    patchDraft(app, id, "v3");
    createSnapshot(app, id, "test");
    assert.ok(fs.statSync(bakFile()).mtimeMs >= mtimeAfterFirst);
  });
});
