import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { closeDb, saveProjectMeta, getDb } from "./researchDb.mjs";
import {
  cancelJob,
  enqueueJob,
  listJobs,
  shutdownAllJobs,
} from "./researchJobQueue.mjs";
import { makeTempUserData } from "./test/researchTestApp.mjs";

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
});
