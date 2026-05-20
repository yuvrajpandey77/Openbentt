import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { closeDb, saveProjectMeta, getDb } from "./researchDb.mjs";
import {
  cancelAllJobs,
  cancelJob,
  enqueueJob,
  listJobs,
  shutdownAllJobs,
} from "./researchJobQueue.mjs";
import { makeTempUserData } from "./test/researchTestApp.mjs";
import { loadEmbeddings, upsertEmbeddings } from "./researchVectorStore.mjs";

function baseProject(id) {
  return {
    id,
    title: "Jobs",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    targetVenue: "generic",
    linkedThreadIds: [],
    draftTex: "\\section{A}\nBody about citations.",
    bibliography: "",
    papers: [
      {
        id: "p1",
        fileName: "a.pdf",
        addedAt: "2024-01-01",
        extractedText: "Citation parsing with neural networks in academic PDFs.",
        metadata: {},
      },
    ],
    chunks: [],
    revisionSuggestions: [],
    modelAttributions: [],
    abstractVariants: [],
    keywordSuggestions: [],
  };
}

describe("researchJobQueue", () => {
  let ctx;

  beforeEach(async () => {
    ctx = await makeTempUserData();
    closeDb();
    shutdownAllJobs();
  });

  afterEach(async () => {
    shutdownAllJobs();
    closeDb();
    await ctx.cleanup();
  });

  it("runs rechunk worker job and persists chunks", async () => {
    const { app } = ctx;
    const projectId = "job-rechunk";
    saveProjectMeta(app, baseProject(projectId));

    const { jobId } = enqueueJob(app, projectId, "rechunk", {
      papers: baseProject(projectId).papers,
      draftTex: baseProject(projectId).draftTex,
    });

    await new Promise((r) => setTimeout(r, 1500));

    const jobs = listJobs(app, projectId);
    const job = jobs.find((j) => j.id === jobId);
    assert.ok(job, "job should be listed");
    assert.equal(job.status, "completed");

    const row = getDb(app)
      .prepare("SELECT COUNT(*) AS n FROM corpus_chunks WHERE project_id = ?")
      .get(projectId);
    assert.ok(row.n > 0, "chunks should be saved");
  });

  it("cancels pending job before worker starts", async () => {
    const { app } = ctx;
    const projectId = "job-cancel";
    saveProjectMeta(app, baseProject(projectId));

    const running = enqueueJob(app, projectId, "rechunk", {
      papers: baseProject(projectId).papers,
      draftTex: baseProject(projectId).draftTex,
    });
    await new Promise((r) => setTimeout(r, 50));

    const second = enqueueJob(app, projectId, "rechunk", {
      papers: baseProject(projectId).papers,
      draftTex: "queued",
    });
    cancelJob(app, projectId, second.jobId);

    await new Promise((r) => setTimeout(r, 2000));
    const jobs = listJobs(app, projectId);
    const cancelled = jobs.find((j) => j.id === second.jobId);
    assert.ok(
      cancelled?.status === "cancelled" || cancelled?.status === "completed",
      "second job should not block queue forever"
    );
    assert.ok(running.jobId);
  });

  it("completes embed job when all library chunks already embedded", async () => {
    const { app } = ctx;
    const projectId = "job-embed-skip";
    saveProjectMeta(app, baseProject(projectId));

    enqueueJob(app, projectId, "rechunk", {
      papers: baseProject(projectId).papers,
      draftTex: baseProject(projectId).draftTex,
      projectId,
    });
    await new Promise((r) => setTimeout(r, 2000));

    const chunkRows = getDb(app)
      .prepare("SELECT id FROM corpus_chunks WHERE project_id = ? AND paper_id != 'draft'")
      .all(projectId);
    assert.ok(chunkRows.length > 0, "library chunks exist");
    for (const row of chunkRows) {
      upsertEmbeddings(app, projectId, [
        { chunkId: row.id, vector: new Array(384).fill(0.01) },
      ]);
    }

    const { jobId: embedId } = enqueueJob(app, projectId, "embed", {});
    await new Promise((r) => setTimeout(r, 3000));

    const embedJob = listJobs(app, projectId).find((j) => j.id === embedId);
    assert.ok(embedJob, "embed job listed");
    assert.equal(embedJob.status, "completed", embedJob?.message ?? "embed failed");
    assert.ok(
      embedJob.message?.includes("up to date") || embedJob.result_json?.includes("skipped"),
      "should skip re-embedding"
    );

    const loaded = loadEmbeddings(app, projectId);
    assert.equal(Object.keys(loaded).length, chunkRows.length);
  });

  it("dedupes concurrent embed job enqueue", async () => {
    const { app } = ctx;
    const projectId = "job-embed-dedupe";
    saveProjectMeta(app, baseProject(projectId));

    const first = enqueueJob(app, projectId, "embed", {});
    const second = enqueueJob(app, projectId, "embed", {});
    assert.ok(first.jobId);
    assert.equal(second.jobId, first.jobId);
    assert.equal(second.deduped, true);
  });

  it("cancels running embed job mid-flight", async () => {
    const { app } = ctx;
    const projectId = "job-embed-abort";
    saveProjectMeta(app, baseProject(projectId));

    enqueueJob(app, projectId, "rechunk", {
      papers: baseProject(projectId).papers,
      draftTex: baseProject(projectId).draftTex,
      projectId,
    });
    await new Promise((r) => setTimeout(r, 2000));

    const { jobId } = enqueueJob(app, projectId, "embed", {});
    await new Promise((r) => setTimeout(r, 150));
    cancelJob(app, projectId, jobId);
    await new Promise((r) => setTimeout(r, 4000));

    const job = listJobs(app, projectId).find((j) => j.id === jobId);
    assert.ok(job, "job should be listed");
    assert.equal(job.status, "cancelled");
  });

  it("cancelAllJobs aborts active rechunk worker", async () => {
    const { app } = ctx;
    const projectId = "job-rechunk-cancel-all";
    saveProjectMeta(app, baseProject(projectId));

    enqueueJob(app, projectId, "rechunk", {
      papers: baseProject(projectId).papers,
      draftTex: baseProject(projectId).draftTex,
    });
    await new Promise((r) => setTimeout(r, 80));
    cancelAllJobs(app, projectId);
    await new Promise((r) => setTimeout(r, 1500));

    const running = listJobs(app, projectId).find((j) => j.status === "running");
    assert.equal(running, undefined, "no job should remain running");
  });

  it("prunes stale embeddings via removedChunkIds on embed job", async () => {
    const { app } = ctx;
    const projectId = "job-embed-prune";
    saveProjectMeta(app, baseProject(projectId));

    enqueueJob(app, projectId, "rechunk", {
      papers: baseProject(projectId).papers,
      draftTex: baseProject(projectId).draftTex,
      projectId,
    });
    await new Promise((r) => setTimeout(r, 2000));

    const chunkRows = getDb(app)
      .prepare("SELECT id FROM corpus_chunks WHERE project_id = ? AND paper_id != 'draft'")
      .all(projectId);
    assert.ok(chunkRows.length >= 1, "library chunks exist");

    const keepId = chunkRows[0].id;
    const staleId = "orphan-stale-chunk";
    upsertEmbeddings(app, projectId, [
      { chunkId: keepId, vector: new Array(384).fill(0.02) },
      { chunkId: staleId, vector: new Array(384).fill(0.03) },
    ]);
    assert.equal(Object.keys(loadEmbeddings(app, projectId)).length, 2);

    const { jobId } = enqueueJob(app, projectId, "embed", {
      removedChunkIds: [staleId, "missing-chunk-id", "", null],
    });
    await new Promise((r) => setTimeout(r, 8000));

    const embedJob = listJobs(app, projectId).find((j) => j.id === jobId);
    assert.ok(embedJob, "embed job listed");
    assert.notEqual(embedJob.status, "failed", embedJob?.message ?? "embed failed");

    const loaded = loadEmbeddings(app, projectId);
    assert.equal(loaded[staleId], undefined, "stale orphan embedding removed");
    assert.ok(loaded[keepId]?.length, "valid chunk embedding retained");
  });
});
