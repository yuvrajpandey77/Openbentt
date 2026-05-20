/**
 * Main-process job queue: progress, cancel, retry. CPU work runs in worker_threads.
 */
import { Worker } from "node:worker_threads";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDb, loadProject, saveChunks } from "./researchDb.mjs";
import {
  deleteEmbeddingsForChunks,
  listEmbeddedChunkIds,
  upsertEmbeddings,
} from "./researchVectorStore.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {Map<string, { jobs: object[], running: boolean, currentId: string | null, abort: AbortController | null, win: Electron.BrowserWindow | null, embedRunning: boolean }>} */
const queues = new Map();

function uuid() {
  return `job-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function getQueue(projectId) {
  if (!queues.has(projectId)) {
    queues.set(projectId, {
      jobs: [],
      running: false,
      currentId: null,
      abort: null,
      win: null,
      embedRunning: false,
    });
  }
  return queues.get(projectId);
}

export function setJobProgressTarget(projectId, win) {
  const q = getQueue(projectId);
  q.win = win ?? null;
}

function emit(win, channel, payload) {
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, payload);
  }
}

function persistJob(app, job) {
  const db = getDb(app);
  db.prepare(
    `INSERT INTO research_jobs (id, project_id, job_type, status, progress, message, payload_json, result_json, attempts, max_attempts, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       status = excluded.status,
       progress = excluded.progress,
       message = excluded.message,
       result_json = excluded.result_json,
       attempts = excluded.attempts,
       updated_at = excluded.updated_at`
  ).run(
    job.id,
    job.projectId,
    job.type,
    job.status,
    job.progress,
    job.message ?? null,
    JSON.stringify(job.payload ?? {}),
    job.result ? JSON.stringify(job.result) : null,
    job.attempts,
    job.maxAttempts,
    job.createdAt,
    job.updatedAt
  );
}

export function enqueueJob(app, projectId, type, payload = {}, opts = {}) {
  const q = getQueue(projectId);

  if (type === "embed") {
    const existing = q.jobs.find(
      (j) => j.type === "embed" && (j.status === "pending" || j.status === "running")
    );
    if (existing || q.embedRunning) {
      return { jobId: existing?.id ?? q.currentId ?? null, deduped: true };
    }
  }

  const job = {
    id: uuid(),
    projectId,
    type,
    payload,
    status: "pending",
    progress: 0,
    message: null,
    result: null,
    attempts: 0,
    maxAttempts: opts.maxAttempts ?? 3,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  q.jobs.push(job);
  persistJob(app, job);
  void drainQueue(app, projectId);
  return { jobId: job.id };
}

export function cancelJob(app, projectId, jobId) {
  const q = getQueue(projectId);
  if (q.currentId === jobId && q.abort) {
    q.abort.abort();
  }
  const job = q.jobs.find((j) => j.id === jobId);
  if (job && job.status === "pending") {
    job.status = "cancelled";
    job.updatedAt = new Date().toISOString();
    persistJob(app, job);
  }
  return { ok: true };
}

export function cancelAllJobs(app, projectId) {
  const q = getQueue(projectId);
  if (q.abort) q.abort.abort();
  for (const j of q.jobs) {
    if (j.status === "pending") {
      j.status = "cancelled";
      persistJob(app, j);
    }
  }
  q.jobs = q.jobs.filter((j) => j.status === "running");
  return { ok: true };
}

export function listJobs(app, projectId) {
  const db = getDb(app);
  return db
    .prepare(
      `SELECT id, job_type AS type, status, progress, message, created_at AS createdAt, updated_at AS updatedAt
       FROM research_jobs WHERE project_id = ? ORDER BY created_at DESC LIMIT 30`
    )
    .all(projectId);
}

async function drainQueue(app, projectId) {
  const q = getQueue(projectId);
  if (q.running) return;
  const next = q.jobs.find((j) => j.status === "pending");
  if (!next) return;

  q.running = true;
  q.currentId = next.id;
  if (next.type === "embed") q.embedRunning = true;
  next.status = "running";
  next.updatedAt = new Date().toISOString();
  persistJob(app, next);
  emit(q.win, "research:jobProgress", {
    projectId,
    jobId: next.id,
    jobType: next.type,
    status: "running",
    progress: 0,
  });

  q.abort = new AbortController();
  try {
    const result = await runJob(app, next, q.abort.signal, (p, msg) => {
      next.progress = p;
      next.message = msg;
      next.updatedAt = new Date().toISOString();
      persistJob(app, next);
      emit(q.win, "research:jobProgress", {
        projectId,
        jobId: next.id,
        jobType: next.type,
        status: "running",
        progress: p,
        message: msg,
      });
    });
    next.status = "completed";
    next.result = result;
    next.progress = 1;
  } catch (err) {
    if (err?.name === "AbortError") {
      next.status = "cancelled";
    } else {
      next.attempts += 1;
      if (next.attempts < next.maxAttempts) {
        next.status = "pending";
        next.message = `Retry ${next.attempts}/${next.maxAttempts}: ${err?.message}`;
        q.jobs.push(next);
      } else {
        next.status = "failed";
        next.message = err?.message ?? "Job failed";
      }
    }
  } finally {
    next.updatedAt = new Date().toISOString();
    persistJob(app, next);
    emit(q.win, "research:jobProgress", {
      projectId,
      jobId: next.id,
      jobType: next.type,
      status: next.status,
      progress: next.progress,
      message: next.message,
    });
    q.running = false;
    q.currentId = null;
    if (next.type === "embed") q.embedRunning = false;
    q.abort = null;
    q.jobs = q.jobs.filter((j) => j.id !== next.id || j.status === "pending");
    void drainQueue(app, projectId);
  }
}

function runChunkWorker(type, payload, signal) {
  return new Promise((resolve, reject) => {
    const workerPath = path.join(__dirname, "researchWorkers", "chunkWorker.mjs");
    const worker = new Worker(workerPath, { workerData: { type, payload } });
    const onAbort = () => {
      worker.terminate();
      reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    worker.on("message", (msg) => {
      if (msg?.error) reject(new Error(msg.error));
      else resolve(msg.result);
    });
    worker.on("error", reject);
    worker.on("exit", (code) => {
      if (code !== 0) reject(new Error(`Worker exited ${code}`));
    });
  });
}

function runEmbedWorker(chunks, resumeVectors, signal, onProgress, onPartial) {
  return new Promise((resolve, reject) => {
    const workerPath = path.join(__dirname, "researchWorkers", "embedWorker.mjs");
    const worker = new Worker(workerPath, {
      workerData: { type: "embed", payload: { chunks, resumeVectors } },
    });
    let settled = false;
    const finish = (fn, val) => {
      if (settled) return;
      settled = true;
      fn(val);
    };
    const onAbort = () => {
      worker.terminate();
      finish(reject, Object.assign(new Error("Aborted"), { name: "AbortError" }));
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    worker.on("message", (msg) => {
      if (msg?.error) {
        if (msg.aborted) finish(reject, Object.assign(new Error("Aborted"), { name: "AbortError" }));
        else finish(reject, new Error(msg.error));
        return;
      }
      if (msg?.type === "progress" && msg.progress) {
        const { done, total, phase } = msg.progress;
        const frac = total > 0 ? done / total : 0;
        onProgress?.(frac, phase === "loading-model" ? "Loading MiniLM…" : `Embedding ${done}/${total}…`);
      }
      if (msg?.type === "partial" && msg.vectors) {
        onPartial?.(msg.vectors);
      }
      if (msg?.result) finish(resolve, msg.result);
    });
    worker.on("error", (err) => finish(reject, err));
    worker.on("exit", (code) => {
      if (!settled && code !== 0) finish(reject, new Error(`Embed worker exited ${code}`));
    });
  });
}

async function runJob(app, job, signal, onProgress) {
  switch (job.type) {
    case "rechunk": {
      onProgress(0.1, "Chunking corpus…");
      const { papers, draftTex, projectId } = job.payload;
      const chunks = await runChunkWorker(
        "rechunk",
        { papers, draftTex, projectId: projectId ?? job.projectId },
        signal
      );
      onProgress(0.8, "Saving chunks…");
      saveChunks(app, job.projectId, chunks);
      onProgress(1, "Done");
      return { chunkCount: chunks.length };
    }
    case "embed": {
      const removed = job.payload.removedChunkIds ?? [];
      if (removed.length) {
        deleteEmbeddingsForChunks(app, job.projectId, removed);
      }

      const data = loadProject(app, job.projectId);
      if (!data) throw new Error("Project not found");
      const library = (data.chunks ?? []).filter((c) => c.paperId !== "draft");
      if (library.length === 0) return { embedded: 0 };

      const embeddedIds = new Set(listEmbeddedChunkIds(app, job.projectId));
      const resumeVectors = {};
      for (const id of embeddedIds) resumeVectors[id] = [];

      const pending = library.filter((c) => !embeddedIds.has(c.id));
      if (pending.length === 0) {
        onProgress(1, "Embeddings up to date");
        return { embedded: 0, skipped: library.length };
      }

      onProgress(0.05, "Loading MiniLM…");
      const { vectors } = await runEmbedWorker(
        library,
        resumeVectors,
        signal,
        (frac, msg) => onProgress(0.1 + frac * 0.85, msg),
        (partial) => {
          const batch = Object.entries(partial)
            .filter(([k, v]) => k !== "__query__" && v?.length)
            .map(([chunkId, vector]) => ({ chunkId, vector }));
          if (batch.length) upsertEmbeddings(app, job.projectId, batch);
        }
      );

      const batch = Object.entries(vectors ?? {})
        .filter(([k, v]) => k !== "__query__" && v?.length)
        .map(([chunkId, vector]) => ({ chunkId, vector }));
      if (batch.length) upsertEmbeddings(app, job.projectId, batch);
      onProgress(1, `Embedded ${batch.length} passages`);
      return { embedded: batch.length };
    }
    default:
      throw new Error(`Unknown job type: ${job.type}`);
  }
}

export function shutdownAllJobs() {
  for (const [, q] of queues) {
    if (q.abort) q.abort.abort();
  }
  queues.clear();
}

/** Re-queue interrupted jobs after app restart (status was running). */
export function resumeInterruptedJobs(app) {
  const db = getDb(app);
  const rows = db
    .prepare(
      `SELECT id, project_id AS projectId, job_type AS type, payload_json, attempts, max_attempts AS maxAttempts, created_at AS createdAt
       FROM research_jobs WHERE status IN ('running', 'pending') ORDER BY created_at ASC`
    )
    .all();
  for (const row of rows) {
    const q = getQueue(row.projectId);
    let payload = {};
    try {
      payload = JSON.parse(row.payload_json ?? "{}");
    } catch {
      /* ignore */
    }
    const job = {
      id: row.id,
      projectId: row.projectId,
      type: row.type,
      payload,
      status: "pending",
      progress: 0,
      message: "Resumed after restart",
      result: null,
      attempts: row.attempts ?? 0,
      maxAttempts: row.maxAttempts ?? 3,
      createdAt: row.createdAt,
      updatedAt: new Date().toISOString(),
    };
    q.jobs.push(job);
    persistJob(app, job);
    void drainQueue(app, row.projectId);
  }
  return { resumed: rows.length };
}
