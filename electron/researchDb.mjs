/**
 * Desktop research persistence — SQLite (node:sqlite) with migrations,
 * corruption recovery, and legacy project.json import.
 */
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const SCHEMA_VERSION = 6;
const ROOT_DIR = "research-projects";

export function projectsRoot(app) {
  return path.join(app.getPath("userData"), ROOT_DIR);
}

export function projectDir(app, id) {
  const safe = id.replace(/[^a-zA-Z0-9_-]/g, "");
  return path.join(projectsRoot(app), safe);
}

function dbPath(app) {
  return path.join(projectsRoot(app), "research.db");
}

function backupPath(app) {
  return path.join(projectsRoot(app), "research.db.bak");
}

let dbSingleton = null;

const BACKUP_DEBOUNCE_MS = 5000;
const BACKUP_EVERY_N_SAVES = 10;
/** @type {ReturnType<typeof setTimeout> | null} */
let backupTimer = null;
let savesSinceBackup = 0;
/** @type {import("electron").App | null} */
let backupAppRef = null;

function initDbConnection(file) {
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  runMigrations(db);
  return db;
}

function openDb(app) {
  if (dbSingleton) return dbSingleton;
  const root = projectsRoot(app);
  fs.mkdirSync(root, { recursive: true });
  const file = dbPath(app);
  const bak = backupPath(app);

  try {
    dbSingleton = initDbConnection(file);
  } catch (err) {
    if (fs.existsSync(bak)) {
      fs.copyFileSync(bak, file);
      dbSingleton = initDbConnection(file);
      console.warn("[researchDb] Recovered from backup after open failure:", err?.message);
    } else {
      throw err;
    }
  }

  return dbSingleton;
}

function runMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER NOT NULL
    );
  `);
  const row = db.prepare("SELECT version FROM schema_version ORDER BY version DESC LIMIT 1").get();
  let v = row?.version ?? 0;

  if (v < 1) migrateV1(db);
  if (v < 2) migrateV2(db);
  if (v < 3) migrateV3(db);
  if (v < 4) migrateV4(db);
  if (v < 5) migrateV5(db);
  if (v < 6) migrateV6(db);

  if (v < SCHEMA_VERSION) {
    db.prepare("DELETE FROM schema_version").run();
    db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(SCHEMA_VERSION);
  }
}

function migrateV1(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      target_venue TEXT NOT NULL DEFAULT 'generic',
      linked_thread_ids TEXT NOT NULL DEFAULT '[]',
      revision_suggestions TEXT NOT NULL DEFAULT '[]',
      model_attributions TEXT NOT NULL DEFAULT '[]',
      abstract_variants TEXT NOT NULL DEFAULT '[]',
      keyword_suggestions TEXT NOT NULL DEFAULT '[]'
    );
    CREATE TABLE IF NOT EXISTS drafts (
      project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
      content TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS bibliography (
      project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
      content TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS papers (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      added_at TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      extracted_text TEXT NOT NULL DEFAULT '',
      page_count INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_papers_project ON papers(project_id);
    CREATE TABLE IF NOT EXISTS corpus_chunks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      paper_id TEXT NOT NULL,
      text TEXT NOT NULL,
      page_hint INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_chunks_project ON corpus_chunks(project_id);
    CREATE TABLE IF NOT EXISTS embeddings (
      chunk_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      dim INTEGER NOT NULL,
      vector BLOB NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (chunk_id, project_id)
    );
    CREATE INDEX IF NOT EXISTS idx_embeddings_project ON embeddings(project_id);
    CREATE TABLE IF NOT EXISTS draft_history (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      label TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_draft_history_project ON draft_history(project_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS project_snapshots (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT 'auto',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_snapshots_project ON project_snapshots(project_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

function migrateV2(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS research_jobs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      job_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      progress REAL NOT NULL DEFAULT 0,
      message TEXT,
      payload_json TEXT,
      result_json TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_project ON research_jobs(project_id, status);
  `);
}

function migrateV3(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_links (
      project_id TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      PRIMARY KEY (project_id, thread_id)
    );
  `);
}

/** Composite PK on corpus_chunks; project-scoped draft chunk IDs. */
function migrateV4(db) {
  const tableRow = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='corpus_chunks'").get();
  if (tableRow?.sql?.includes("PRIMARY KEY (id, project_id)")) return;

  db.exec("DROP TABLE IF EXISTS corpus_chunks_v4");
  db.exec(`
    CREATE TABLE corpus_chunks_v4 (
      id TEXT NOT NULL,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      paper_id TEXT NOT NULL,
      text TEXT NOT NULL,
      page_hint INTEGER,
      PRIMARY KEY (id, project_id)
    );
  `);

  const rows = db.prepare("SELECT id, project_id, paper_id, text, page_hint FROM corpus_chunks").all();
  const insert = db.prepare(
    "INSERT INTO corpus_chunks_v4 (id, project_id, paper_id, text, page_hint) VALUES (?, ?, ?, ?, ?)"
  );
  const remapDraft = db.prepare(
    "UPDATE embeddings SET chunk_id = ? WHERE chunk_id = ? AND project_id = ?"
  );

  for (const r of rows) {
    let id = r.id;
    if (r.paper_id === "draft" && !String(id).includes(":")) {
      const newId = `${r.project_id}:${id}`;
      remapDraft.run(newId, id, r.project_id);
      id = newId;
    }
    insert.run(id, r.project_id, r.paper_id, r.text, r.page_hint);
  }

  db.exec("DROP TABLE corpus_chunks");
  db.exec("ALTER TABLE corpus_chunks_v4 RENAME TO corpus_chunks");
  db.exec("CREATE INDEX IF NOT EXISTS idx_chunks_project ON corpus_chunks(project_id)");
}

function migrateV5(db) {
  const paperCols = db.prepare("PRAGMA table_info(papers)").all();
  if (!paperCols.some((c) => c.name === "review_json")) {
    db.exec(`ALTER TABLE papers ADD COLUMN review_json TEXT NOT NULL DEFAULT '{}'`);
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_files (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      path TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'tex',
      content TEXT NOT NULL DEFAULT '',
      added_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(project_id, path)
    );
    CREATE INDEX IF NOT EXISTS idx_project_files_project ON project_files(project_id);
  `);
}

/**
 * v6: knowledge context column on projects; chat_logs table.
 */
function migrateV6(db) {
  const projCols = db.prepare("PRAGMA table_info(projects)").all();
  if (!projCols.some((c) => c.name === "knowledge")) {
    db.exec(`ALTER TABLE projects ADD COLUMN knowledge TEXT NOT NULL DEFAULT ''`);
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_logs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      thread_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      model TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chat_logs_project ON chat_logs(project_id, created_at ASC);
    CREATE INDEX IF NOT EXISTS idx_chat_logs_thread ON chat_logs(thread_id);
  `);
}

export function hasActiveRechunkJob(app, projectId) {
  const db = openDb(app);
  const row = db
    .prepare(
      `SELECT 1 AS n FROM research_jobs
       WHERE project_id = ? AND job_type = 'rechunk' AND status IN ('pending', 'running')
       LIMIT 1`
    )
    .get(projectId);
  return Boolean(row);
}

export function getDb(app) {
  return openDb(app);
}

export function backupDatabase(app) {
  const db = openDb(app);
  db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
  const file = dbPath(app);
  const bak = backupPath(app);
  if (fs.existsSync(file)) {
    fs.copyFileSync(file, bak);
  }
}

/** Debounced backup — avoids copying research.db on every saveProjectMeta. */
export function scheduleBackupDatabase(app) {
  backupAppRef = app;
  savesSinceBackup += 1;
  if (savesSinceBackup >= BACKUP_EVERY_N_SAVES) {
    flushScheduledBackup();
    return;
  }
  if (backupTimer) return;
  backupTimer = setTimeout(() => {
    flushScheduledBackup();
  }, BACKUP_DEBOUNCE_MS);
}

export function flushScheduledBackup(app = backupAppRef) {
  if (backupTimer) {
    clearTimeout(backupTimer);
    backupTimer = null;
  }
  savesSinceBackup = 0;
  if (app) backupDatabase(app);
}

export function setActiveProjectId(app, id) {
  const db = openDb(app);
  db.prepare(
    "INSERT INTO app_state (key, value) VALUES ('activeProjectId', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(id ?? "");
}

export function getActiveProjectId(app) {
  const db = openDb(app);
  const row = db.prepare("SELECT value FROM app_state WHERE key = 'activeProjectId'").get();
  return row?.value || null;
}

export function listProjectSummaries(app) {
  const db = openDb(app);
  const rows = db
    .prepare(
      `SELECT p.id, p.title, p.created_at AS createdAt, p.updated_at AS updatedAt,
        (SELECT COUNT(*) FROM papers WHERE project_id = p.id) AS paperCount
       FROM projects p ORDER BY p.updated_at DESC`
    )
    .all();
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    createdAt: r.createdAt ?? r.updatedAt,
    updatedAt: r.updatedAt,
    paperCount: r.paperCount ?? 0,
  }));
}

function parseJson(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function loadProject(app, id) {
  const db = openDb(app);
  const p = db.prepare("SELECT * FROM projects WHERE id = ?").get(id);
  if (!p) return null;

  const draft = db.prepare("SELECT content FROM drafts WHERE project_id = ?").get(id);
  const bib = db.prepare("SELECT content FROM bibliography WHERE project_id = ?").get(id);
  const papers = db
    .prepare("SELECT * FROM papers WHERE project_id = ? ORDER BY added_at ASC")
    .all(id)
    .map((row) => {
      const review = parseJson(row.review_json, {});
      return {
        id: row.id,
        fileName: row.file_name,
        addedAt: row.added_at,
        extractedText: row.extracted_text,
        pageCount: row.page_count ?? undefined,
        metadata: parseJson(row.metadata_json, {}),
        reviewStatus: review.reviewStatus,
        lastReviewedPage: review.lastReviewedPage,
        reviewedAt: review.reviewedAt,
        pageNotes: review.pageNotes,
        reviewNotes: review.reviewNotes,
      };
    });

  const projectFiles = db
    .prepare("SELECT * FROM project_files WHERE project_id = ? ORDER BY path ASC")
    .all(id)
    .map((row) => ({
      id: row.id,
      path: row.path,
      kind: row.kind,
      content: row.content,
      addedAt: row.added_at,
      updatedAt: row.updated_at,
    }));

  const chunks = db
    .prepare("SELECT id, paper_id AS paperId, text, page_hint AS pageHint FROM corpus_chunks WHERE project_id = ?")
    .all(id);

  const revisionSuggestions = parseJson(p.revision_suggestions, []);
  const modelAttributions = parseJson(p.model_attributions, []);
  const abstractVariants = parseJson(p.abstract_variants, []);
  const keywordSuggestions = parseJson(p.keyword_suggestions, []);
  const linkedThreadIds = parseJson(p.linked_thread_ids, []);

  return {
    id: p.id,
    title: p.title,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    targetVenue: p.target_venue,
    linkedThreadIds,
    knowledge: p.knowledge ?? "",
    draftTex: draft?.content ?? "",
    bibliography: bib?.content ?? "",
    bibEntries: [],
    papers,
    chunks,
    revisionSuggestions,
    modelAttributions,
    abstractVariants,
    keywordSuggestions,
    projectFiles,
  };
}

export function saveProjectMeta(app, data, opts = {}) {
  const db = openDb(app);
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO projects (
      id, title, created_at, updated_at, target_venue, linked_thread_ids,
      revision_suggestions, model_attributions, abstract_variants, keyword_suggestions,
      knowledge
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      updated_at = excluded.updated_at,
      target_venue = excluded.target_venue,
      linked_thread_ids = excluded.linked_thread_ids,
      revision_suggestions = excluded.revision_suggestions,
      model_attributions = excluded.model_attributions,
      abstract_variants = excluded.abstract_variants,
      keyword_suggestions = excluded.keyword_suggestions,
      knowledge = excluded.knowledge`
  ).run(
    data.id,
    data.title,
    data.createdAt ?? now,
    data.updatedAt ?? now,
    data.targetVenue ?? "generic",
    JSON.stringify(data.linkedThreadIds ?? []),
    JSON.stringify(data.revisionSuggestions ?? []),
    JSON.stringify(data.modelAttributions ?? []),
    JSON.stringify(data.abstractVariants ?? []),
    JSON.stringify(data.keywordSuggestions ?? []),
    data.knowledge ?? ""
  );

  db.prepare(
    `INSERT INTO drafts (project_id, content, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(project_id) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`
  ).run(data.id, data.draftTex ?? "", now);

  db.prepare(
    `INSERT INTO bibliography (project_id, content, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(project_id) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`
  ).run(data.id, data.bibliography ?? "", now);

  savePapers(app, data.id, data.papers ?? []);
  saveProjectFiles(app, data.id, data.projectFiles ?? []);
  const skipChunks = opts.skipChunks === true || hasActiveRechunkJob(app, data.id);
  if (!skipChunks) {
    saveChunks(app, data.id, data.chunks ?? []);
  }
  scheduleBackupDatabase(app);
}

export function patchDraft(app, projectId, content) {
  const db = openDb(app);
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO drafts (project_id, content, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(project_id) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`
  ).run(projectId, content, now);
  db.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").run(now, projectId);
  return { ok: true, updatedAt: now };
}

export function patchBibliography(app, projectId, content) {
  const db = openDb(app);
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO bibliography (project_id, content, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(project_id) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`
  ).run(projectId, content, now);
  db.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").run(now, projectId);
  return { ok: true, updatedAt: now };
}

export function patchKnowledge(app, projectId, content) {
  const db = openDb(app);
  const now = new Date().toISOString();
  db.prepare("UPDATE projects SET knowledge = ?, updated_at = ? WHERE id = ?").run(
    content,
    now,
    projectId
  );
  return { ok: true, updatedAt: now };
}

export function appendChatLog(app, projectId, { id, threadId, role, content, model }) {
  const db = openDb(app);
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO chat_logs (id, project_id, thread_id, role, content, model, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`
  ).run(id, projectId, threadId, role, content, model ?? null, now);
  return { ok: true };
}

export function listChatLogs(app, projectId, { limit = 200 } = {}) {
  const db = openDb(app);
  return db
    .prepare(
      `SELECT id, thread_id AS threadId, role, content, model, created_at AS createdAt
       FROM chat_logs WHERE project_id = ? ORDER BY created_at ASC LIMIT ?`
    )
    .all(projectId, limit);
}

export function listLinkedThreadsWithCount(app, projectId) {
  const db = openDb(app);
  return db
    .prepare(
      `SELECT thread_id AS threadId, COUNT(*) AS messageCount, MAX(created_at) AS lastAt
       FROM chat_logs WHERE project_id = ? GROUP BY thread_id ORDER BY lastAt DESC`
    )
    .all(projectId);
}

export function savePapers(app, projectId, papers) {
  const db = openDb(app);
  const existing = new Set(
    db.prepare("SELECT id FROM papers WHERE project_id = ?").all(projectId).map((r) => r.id)
  );
  const incoming = new Set(papers.map((p) => p.id));
  for (const id of existing) {
    if (!incoming.has(id)) {
      db.prepare("DELETE FROM papers WHERE id = ? AND project_id = ?").run(id, projectId);
    }
  }
  const stmt = db.prepare(
    `INSERT INTO papers (id, project_id, file_name, added_at, metadata_json, extracted_text, page_count, review_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       file_name = excluded.file_name,
       metadata_json = excluded.metadata_json,
       extracted_text = excluded.extracted_text,
       page_count = excluded.page_count,
       review_json = excluded.review_json`
  );
  for (const p of papers) {
    const reviewJson = JSON.stringify({
      reviewStatus: p.reviewStatus,
      lastReviewedPage: p.lastReviewedPage,
      reviewedAt: p.reviewedAt,
      pageNotes: p.pageNotes,
      reviewNotes: p.reviewNotes,
    });
    stmt.run(
      p.id,
      projectId,
      p.fileName,
      p.addedAt,
      JSON.stringify(p.metadata ?? {}),
      p.extractedText ?? "",
      p.pageCount ?? null,
      reviewJson
    );
  }
}

export function saveProjectFiles(app, projectId, files) {
  const db = openDb(app);
  const existing = new Set(
    db.prepare("SELECT id FROM project_files WHERE project_id = ?").all(projectId).map((r) => r.id)
  );
  const incoming = new Set(files.map((f) => f.id));
  for (const id of existing) {
    if (!incoming.has(id)) {
      db.prepare("DELETE FROM project_files WHERE id = ? AND project_id = ?").run(id, projectId);
    }
  }
  const stmt = db.prepare(
    `INSERT INTO project_files (id, project_id, path, kind, content, added_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       path = excluded.path,
       kind = excluded.kind,
       content = excluded.content,
       updated_at = excluded.updated_at`
  );
  for (const f of files) {
    stmt.run(f.id, projectId, f.path, f.kind, f.content ?? "", f.addedAt, f.updatedAt);
  }
}

function normalizeChunkId(projectId, chunk) {
  if (chunk?.paperId === "draft" && chunk?.id && !String(chunk.id).includes(":")) {
    return `${projectId}:${chunk.id}`;
  }
  return chunk?.id;
}

export function saveChunks(app, projectId, chunks) {
  const db = openDb(app);
  const deleteChunks = db.prepare("DELETE FROM corpus_chunks WHERE project_id = ?");
  const insert = db.prepare(
    "INSERT INTO corpus_chunks (id, project_id, paper_id, text, page_hint) VALUES (?, ?, ?, ?, ?)"
  );
  deleteChunks.run(projectId);
  const seen = new Set();
  for (const c of chunks ?? []) {
    const id = normalizeChunkId(projectId, c);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    insert.run(id, projectId, c.paperId, c.text, c.pageHint ?? null);
  }
}

export function deleteProject(app, id) {
  const db = openDb(app);
  db.prepare("DELETE FROM projects WHERE id = ?").run(id);
  const dir = projectDir(app, id);
  fsPromises.rm(dir, { recursive: true, force: true }).catch(() => {});
}

export function createSnapshot(app, projectId, reason = "auto") {
  const data = loadProject(app, projectId);
  if (!data) return null;
  const db = openDb(app);
  const id = `snap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO project_snapshots (id, project_id, payload_json, reason, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(id, projectId, JSON.stringify(data), reason, now);
  const excess = db
    .prepare(
      "SELECT id FROM project_snapshots WHERE project_id = ? ORDER BY created_at DESC LIMIT -1 OFFSET 20"
    )
    .all(projectId);
  for (const row of excess) {
    db.prepare("DELETE FROM project_snapshots WHERE id = ?").run(row.id);
  }
  flushScheduledBackup(app);
  return { id, createdAt: now };
}

export function listSnapshots(app, projectId) {
  const db = openDb(app);
  return db
    .prepare(
      "SELECT id, reason, created_at AS createdAt FROM project_snapshots WHERE project_id = ? ORDER BY created_at DESC LIMIT 20"
    )
    .all(projectId);
}

export function restoreSnapshot(app, snapshotId) {
  const db = openDb(app);
  const row = db.prepare("SELECT payload_json, project_id FROM project_snapshots WHERE id = ?").get(snapshotId);
  if (!row) throw new Error("Snapshot not found");
  const data = JSON.parse(row.payload_json);
  saveProjectMeta(app, data);
  return loadProject(app, row.project_id);
}

export function pushDraftHistory(app, projectId, content, label) {
  const db = openDb(app);
  const id = `dh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO draft_history (id, project_id, content, label, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(id, projectId, content, label ?? null, now);
  const excess = db
    .prepare(
      "SELECT id FROM draft_history WHERE project_id = ? ORDER BY created_at DESC LIMIT -1 OFFSET 50"
    )
    .all(projectId);
  for (const row of excess) {
    db.prepare("DELETE FROM draft_history WHERE id = ?").run(row.id);
  }
  return { id, createdAt: now };
}

export function listDraftHistory(app, projectId, limit = 20) {
  const db = openDb(app);
  return db
    .prepare(
      "SELECT id, label, created_at AS createdAt, length(content) AS charCount FROM draft_history WHERE project_id = ? ORDER BY created_at DESC LIMIT ?"
    )
    .all(projectId, limit);
}

export function getDraftHistoryEntry(app, entryId) {
  const db = openDb(app);
  const row = db.prepare("SELECT content, project_id FROM draft_history WHERE id = ?").get(entryId);
  if (!row) return null;
  return row;
}

/** Import legacy per-project project.json into SQLite (one-time). */
export async function migrateLegacyProjects(app) {
  const root = projectsRoot(app);
  await fsPromises.mkdir(root, { recursive: true });
  const db = openDb(app);
  let dirs;
  try {
    dirs = await fsPromises.readdir(root, { withFileTypes: true });
  } catch {
    return { migrated: 0 };
  }

  let migrated = 0;
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    const legacyPath = path.join(root, d.name, "project.json");
    const legacyBak = path.join(root, d.name, "project.json.legacy");
    let rawPath = legacyPath;
    if (!fs.existsSync(rawPath) && fs.existsSync(legacyBak)) continue;
    if (!fs.existsSync(rawPath)) continue;

    try {
      const raw = await fsPromises.readFile(rawPath, "utf8");
      const data = JSON.parse(raw);
      if (!data?.id) continue;
      const existing = db.prepare("SELECT id FROM projects WHERE id = ?").get(data.id);
      if (existing) {
        await fsPromises.rename(rawPath, legacyBak).catch(() => {});
        continue;
      }

      const papers = data.papers ?? [];
      const chunks = data.chunks ?? [];
      saveProjectMeta(app, {
        id: data.id,
        title: data.title ?? d.name,
        createdAt: data.createdAt ?? new Date().toISOString(),
        updatedAt: data.updatedAt ?? new Date().toISOString(),
        targetVenue: data.targetVenue ?? "generic",
        linkedThreadIds: data.linkedThreadIds ?? [],
        draftTex: data.draftTex ?? "",
        bibliography: data.bibliography ?? "",
        papers,
        chunks,
        revisionSuggestions: data.revisionSuggestions ?? [],
        modelAttributions: data.modelAttributions ?? [],
        abstractVariants: data.abstractVariants ?? [],
        keywordSuggestions: data.keywordSuggestions ?? [],
      });

      if (data.chunkEmbeddings && typeof data.chunkEmbeddings === "object") {
        const { upsertEmbeddings } = await import("./researchVectorStore.mjs");
        const batch = Object.entries(data.chunkEmbeddings)
          .filter(([k]) => k !== "__query__")
          .map(([chunkId, vec]) => ({ chunkId, vector: vec }));
        if (batch.length) upsertEmbeddings(app, data.id, batch);
      }

      await fsPromises.rename(rawPath, legacyBak);
      migrated++;
      createSnapshot(app, data.id, "pre-migration");
    } catch (err) {
      console.warn("[researchDb] Legacy migrate failed for", d.name, err?.message);
    }
  }
  return { migrated };
}

export function closeDb() {
  flushScheduledBackup();
  if (dbSingleton) {
    try {
      dbSingleton.close();
    } catch {
      /* ignore */
    }
    dbSingleton = null;
  }
}
