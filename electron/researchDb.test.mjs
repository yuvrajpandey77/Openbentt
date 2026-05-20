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
  getDb,
  listSnapshots,
  loadProject,
  migrateLegacyProjects,
  patchDraft,
  projectDir,
  projectsRoot,
  restoreSnapshot,
  saveProjectMeta,
} from "./researchDb.mjs";

function mockApp(root) {
  return {
    getPath: () => root,
  };
}

describe("researchDb desktop storage", () => {
  let tmpRoot;
  let app;

  before(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "openbentt-research-test-"));
    app = mockApp(tmpRoot);
  });

  afterEach(() => {
    closeDb();
  });

  after(() => {
    closeDb();
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
});
