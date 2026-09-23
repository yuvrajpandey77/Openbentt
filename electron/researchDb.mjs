/**
 * Desktop research persistence — SQLite (node:sqlite) with migrations,
 * corruption recovery, and legacy project.json import.
 */
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const SCHEMA_VERSION = 14;

export function getSchemaVersion() {
  return SCHEMA_VERSION;
}
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
  if (v < 7) migrateV7(db);
  if (v < 8) migrateV8(db);
  if (v < 9) migrateV9(db);
  if (v < 10) migrateV10(db);
  if (v < 11) migrateV11(db);
  if (v < 12) migrateV12(db);
  if (v < 13) migrateV13(db);
  if (v < 14) migrateV14(db);

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

/**
 * v7 (Phase 2, additive only): canonical document intelligence tables.
 * Existing corpus_chunks/embeddings/papers shapes are untouched; these tables
 * carry identity/version/extraction-cache so future parsers can invalidate
 * without reprocessing. Safe on fresh, v6-seeded, and legacy databases.
 */
export function migrateV7(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      title TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT '',
      source_type TEXT NOT NULL DEFAULT 'unknown',
      mime_type TEXT NOT NULL DEFAULT '',
      size INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL DEFAULT '',
      extractor_version TEXT NOT NULL DEFAULT '',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      extraction_status TEXT NOT NULL DEFAULT 'failed',
      status TEXT NOT NULL DEFAULT 'failed',
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_documents_project ON documents(project_id);
    CREATE INDEX IF NOT EXISTS idx_documents_checksum ON documents(checksum);
    CREATE TABLE IF NOT EXISTS document_versions (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      version INTEGER NOT NULL,
      checksum TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT '',
      extractor_version TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_doc_versions_doc ON document_versions(document_id);
    CREATE TABLE IF NOT EXISTS document_extract_cache (
      cache_key TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      extractor TEXT NOT NULL DEFAULT '',
      extractor_version TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'failed',
      content_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
  `);
}

/**
 * v8 (Phase 3, additive only): durable provenance-first knowledge graph.
 * Existing tables untouched. Evidence references Phase 2 document/chunk ids
 * without copying content; deletion/versioning handled by status + stale
 * checks in knowledgeStore.mjs (soft semantics, history preserved).
 */
export function migrateV8(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_entities (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      type TEXT NOT NULL,
      canonical_name TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      merged_into TEXT,
      properties_json TEXT NOT NULL DEFAULT '{}',
      origin TEXT NOT NULL DEFAULT 'system',
      provenance TEXT NOT NULL DEFAULT 'automatic',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_kent_proj_type ON knowledge_entities(project_id, type);
    CREATE INDEX IF NOT EXISTS idx_kent_norm ON knowledge_entities(normalized_name);
    CREATE INDEX IF NOT EXISTS idx_kent_status ON knowledge_entities(status);
    CREATE TABLE IF NOT EXISTS knowledge_entity_aliases (
      entity_id TEXT NOT NULL REFERENCES knowledge_entities(id) ON DELETE CASCADE,
      alias TEXT NOT NULL,
      PRIMARY KEY (entity_id, alias)
    );
    CREATE INDEX IF NOT EXISTS idx_kalias_alias ON knowledge_entity_aliases(alias);
    CREATE TABLE IF NOT EXISTS knowledge_entity_identifiers (
      entity_id TEXT NOT NULL REFERENCES knowledge_entities(id) ON DELETE CASCADE,
      namespace TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (entity_id, namespace, value)
    );
    CREATE INDEX IF NOT EXISTS idx_kid_nsval ON knowledge_entity_identifiers(namespace, value);
    CREATE TABLE IF NOT EXISTS knowledge_entity_tags (
      entity_id TEXT NOT NULL REFERENCES knowledge_entities(id) ON DELETE CASCADE,
      tag TEXT NOT NULL,
      PRIMARY KEY (entity_id, tag)
    );
    CREATE INDEX IF NOT EXISTS idx_ktag_tag ON knowledge_entity_tags(tag);
    CREATE TABLE IF NOT EXISTS knowledge_relationships (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      type TEXT NOT NULL,
      subject_id TEXT NOT NULL REFERENCES knowledge_entities(id) ON DELETE CASCADE,
      object_id TEXT NOT NULL REFERENCES knowledge_entities(id) ON DELETE CASCADE,
      properties_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'asserted',
      confidence TEXT NOT NULL DEFAULT 'medium',
      origin TEXT NOT NULL DEFAULT 'system',
      provenance TEXT NOT NULL DEFAULT 'automatic',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_krel_subj ON knowledge_relationships(subject_id);
    CREATE INDEX IF NOT EXISTS idx_krel_obj ON knowledge_relationships(object_id);
    CREATE INDEX IF NOT EXISTS idx_krel_type ON knowledge_relationships(type);
    CREATE INDEX IF NOT EXISTS idx_krel_proj ON knowledge_relationships(project_id, status);
    CREATE TABLE IF NOT EXISTS knowledge_evidence (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      subject_type TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      predicate TEXT,
      quote TEXT,
      evidence_type TEXT NOT NULL DEFAULT 'document',
      source_json TEXT NOT NULL DEFAULT '{}',
      source_document_id TEXT NOT NULL DEFAULT '',
      evidence_doc_version INTEGER,
      extractor_version TEXT,
      confidence TEXT NOT NULL DEFAULT 'medium',
      status TEXT NOT NULL DEFAULT 'current',
      origin TEXT NOT NULL DEFAULT 'system',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_kev_subj ON knowledge_evidence(subject_type, subject_id);
    CREATE INDEX IF NOT EXISTS idx_kev_doc ON knowledge_evidence(source_document_id);
    CREATE INDEX IF NOT EXISTS idx_kev_proj ON knowledge_evidence(project_id, status);
    CREATE TABLE IF NOT EXISTS knowledge_entity_merges (
      id TEXT PRIMARY KEY,
      from_id TEXT NOT NULL,
      into_id TEXT NOT NULL REFERENCES knowledge_entities(id) ON DELETE CASCADE,
      reason TEXT,
      origin TEXT NOT NULL DEFAULT 'system',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_kmerge_from ON knowledge_entity_merges(from_id);
  `);
}

/**
 * v9 (Phase 4, additive only): connector foundation tables.
 * Existing tables untouched. Raw provider metadata is NOT stored here
 * (bounded rawMetadata lives on the normalized item at import time only);
 * these tables track sources, seen item hashes, sync runs, and
 * connector→entity links. No secrets are ever stored in these tables.
 */
export function migrateV9(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS connector_sources (
      id TEXT PRIMARY KEY,
      connector_id TEXT NOT NULL,
      display_name TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_csrc_connector ON connector_sources(connector_id);
    CREATE TABLE IF NOT EXISTS connector_items (
      connector_id TEXT NOT NULL,
      external_id TEXT NOT NULL,
      item_hash TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'seen',
      last_seen_at TEXT NOT NULL,
      retrieved_at TEXT NOT NULL,
      PRIMARY KEY (connector_id, external_id)
    );
    CREATE INDEX IF NOT EXISTS idx_citem_seen ON connector_items(last_seen_at);
    CREATE TABLE IF NOT EXISTS connector_sync_runs (
      id TEXT PRIMARY KEY,
      connector_id TEXT NOT NULL,
      scope TEXT NOT NULL DEFAULT 'default',
      started_at TEXT NOT NULL,
      completed_at TEXT,
      status TEXT NOT NULL DEFAULT 'syncing',
      counts_json TEXT NOT NULL DEFAULT '{}',
      error TEXT,
      provider_version TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_crun_connector ON connector_sync_runs(connector_id, started_at DESC);
    CREATE TABLE IF NOT EXISTS connector_item_links (
      connector_id TEXT NOT NULL,
      external_id TEXT NOT NULL,
      entity_id TEXT NOT NULL REFERENCES knowledge_entities(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      PRIMARY KEY (connector_id, external_id)
    );
    CREATE INDEX IF NOT EXISTS idx_clink_entity ON connector_item_links(entity_id);
  `);
}

/**
 * v10 (Phase 5, additive only): tool audit ledger.
 * One bounded row per tool execution: identifiers + redacted summaries only.
 * No secrets, no raw inputs, no document text, no provider payloads.
 */
export function migrateV10(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tool_audit_events (
      id TEXT PRIMARY KEY,
      tool_id TEXT NOT NULL,
      tool_version TEXT NOT NULL DEFAULT '',
      request_id TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'unknown',
      project_id TEXT,
      permission TEXT NOT NULL DEFAULT 'READ_ONLY',
      risk TEXT NOT NULL DEFAULT 'LOW',
      decision TEXT NOT NULL DEFAULT 'DENY',
      status TEXT NOT NULL DEFAULT 'failed',
      duration_ms INTEGER NOT NULL DEFAULT 0,
      resource_summary_json TEXT NOT NULL DEFAULT '{}',
      error_category TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_taudit_time ON tool_audit_events(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_taudit_tool ON tool_audit_events(tool_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_taudit_project ON tool_audit_events(project_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_taudit_status ON tool_audit_events(status, created_at DESC);
  `);
}

/**
 * v11 (Phase 7, additive only): enterprise connection metadata + cursors + MCP.
 * NO tokens/secrets in SQLite — OAuth/MCP tokens live in OS-vault files
 * (connectorAuthStore/mcpStore). Tables hold safe metadata + sync cursors.
 */
export function migrateV11(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS connector_connections (
      connector_id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'DISCONNECTED',
      account_label TEXT,
      scopes_json TEXT NOT NULL DEFAULT '[]',
      connected_at TEXT,
      verified_at TEXT,
      last_sync_at TEXT,
      auth_required INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS connector_cursors (
      connector_id TEXT NOT NULL,
      scope TEXT NOT NULL DEFAULT 'default',
      cursor TEXT,
      last_success_at TEXT,
      item_count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (connector_id, scope)
    );
    CREATE INDEX IF NOT EXISTS idx_ccursor_connector ON connector_cursors(connector_id);
    CREATE TABLE IF NOT EXISTS mcp_servers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      transport TEXT NOT NULL DEFAULT 'streamable-http',
      endpoint TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      allowed_tools_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

/**
 * v12 (Phase 8, additive only): controlled actions + sync + workflows + MCP server.
 * - action_approvals: bound confirmations (fingerprint, expiry, single-use).
 * - action_executions: idempotency dedupe + verified provider results.
 * - sync_config: per-connector background sync schedule (user-controlled).
 * - workflows / workflow_runs: minimal deterministic workflow engine.
 * - mcp_server_config: opt-in MCP server exposure (OFF by default).
 * No secrets in any of these tables (tokens stay in OS-vault files).
 */
export function migrateV12(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS action_approvals (
      id TEXT PRIMARY KEY,
      tool_id TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      project_id TEXT,
      run_id TEXT,
      request_id TEXT NOT NULL DEFAULT '',
      input_json TEXT NOT NULL DEFAULT '{}',
      preview_json TEXT NOT NULL DEFAULT '[]',
      risk TEXT NOT NULL DEFAULT 'MEDIUM',
      status TEXT NOT NULL DEFAULT 'proposed',
      created_at TEXT NOT NULL,
      decided_at TEXT,
      consumed_at TEXT,
      expires_at TEXT NOT NULL,
      audit_event_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_aappr_status ON action_approvals(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_aappr_fp ON action_approvals(fingerprint);
    CREATE INDEX IF NOT EXISTS idx_aappr_project ON action_approvals(project_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS action_executions (
      idempotency_key TEXT PRIMARY KEY,
      tool_id TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      project_id TEXT,
      run_id TEXT,
      approval_id TEXT,
      status TEXT NOT NULL DEFAULT 'succeeded',
      provider TEXT NOT NULL DEFAULT '',
      external_id TEXT,
      result_json TEXT NOT NULL DEFAULT '{}',
      audit_event_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_aexec_fp ON action_executions(fingerprint);
    CREATE TABLE IF NOT EXISTS sync_config (
      connector_id TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 0,
      interval_minutes INTEGER NOT NULL DEFAULT 15,
      last_run_at TEXT,
      next_run_at TEXT,
      consecutive_failures INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS workflows (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      trigger_json TEXT NOT NULL DEFAULT '{}',
      steps_json TEXT NOT NULL DEFAULT '[]',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS workflow_runs (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
      trigger_kind TEXT NOT NULL DEFAULT 'manual',
      status TEXT NOT NULL DEFAULT 'running',
      current_step INTEGER NOT NULL DEFAULT 0,
      state_json TEXT NOT NULL DEFAULT '{}',
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_wrun_workflow ON workflow_runs(workflow_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_wrun_status ON workflow_runs(status, created_at DESC);
    CREATE TABLE IF NOT EXISTS mcp_server_config (
      id TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 0,
      port INTEGER NOT NULL DEFAULT 3877,
      allowed_tools_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

export function migrateV13(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      prompt TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'UNKNOWN',
      mode TEXT NOT NULL DEFAULT 'build',
      workspace_id TEXT NOT NULL DEFAULT '',
      workspace_root TEXT NOT NULL DEFAULT '',
      workspace_name TEXT NOT NULL DEFAULT '',
      session_id TEXT,
      status TEXT NOT NULL DEFAULT 'QUEUED',
      provider TEXT,
      model TEXT,
      provider_status TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_atasks_status ON agent_tasks(status, updated_at DESC);
    CREATE TABLE IF NOT EXISTS agent_sessions (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL DEFAULT '',
      task_id TEXT,
      status TEXT NOT NULL DEFAULT 'READY',
      opencode_session_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS agent_events (
      event_id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      session_id TEXT NOT NULL DEFAULT 'unknown',
      type TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_aevents_task ON agent_events(task_id, created_at ASC);
    CREATE TABLE IF NOT EXISTS agent_runtime_meta (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL
    );
  `);
}

/**
 * v14 (Phase 3, additive only): input modality on agent tasks.
 * `input_source` is TEXT or VOICE metadata — voice changes nothing about
 * routing, policy, or approvals.
 */
export function migrateV14(db) {
  const cols = db.prepare("PRAGMA table_info(agent_tasks)").all().map((c) => c.name);
  if (!cols.includes("input_source")) {
    db.exec("ALTER TABLE agent_tasks ADD COLUMN input_source TEXT NOT NULL DEFAULT 'text';");
  }
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
