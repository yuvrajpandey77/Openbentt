/**
 * Main-process job queue: progress, cancel, retry. CPU work runs in worker_threads.
 */
import { Worker } from "node:worker_threads";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "./researchDb.mjs";
import { saveChunks } from "./researchDb.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {Map<string, { jobs: object[], running: boolean, currentId: string | null, abort: AbortController | null, win: Electron.BrowserWindow | null }>} */
const queues = new Map();

function uuid() {
  return `job-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function getQueue(projectId) {
  if (!queues.has(projectId)) {
    queues.set(projectId, { jobs: [], running: false, currentId: null, abort: null, win: null });
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
  next.status = "running";
  next.updatedAt = new Date().toISOString();
  persistJob(app, next);
  emit(q.win, "research:jobProgress", { projectId, jobId: next.id, status: "running", progress: 0 });

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
      status: next.status,
      progress: next.progress,
      message: next.message,
    });
    q.running = false;
    q.currentId = null;
    q.abort = null;
    q.jobs = q.jobs.filter((j) => j.id !== next.id || j.status === "pending");
    void drainQueue(app, projectId);
  }
}

function runWorker(type, payload, signal) {
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

async function runJob(app, job, signal, onProgress) {
  switch (job.type) {
    case "rechunk": {
      onProgress(0.1, "Chunking corpus…");
      const { papers, draftTex } = job.payload;
      const chunks = await runWorker("rechunk", { papers, draftTex }, signal);
      onProgress(0.8, "Saving chunks…");
      saveChunks(app, job.projectId, chunks);
      onProgress(1, "Done");
      return { chunkCount: chunks.length };
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
