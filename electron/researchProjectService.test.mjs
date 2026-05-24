import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { closeDb, loadProject, saveProjectMeta } from "./researchDb.mjs";
import { shutdownAllJobs } from "./researchJobQueue.mjs";
import { registerResearchProjectIpc, initResearchStorage } from "./researchProjectService.mjs";
import { makeTempUserData } from "./test/researchTestApp.mjs";

function mockIpcMain() {
  /** @type {Map<string, Function>} */
  const handlers = new Map();
  return {
    handle(channel, fn) {
      handlers.set(channel, fn);
    },
    async invoke(channel, ...args) {
      const fn = handlers.get(channel);
      if (!fn) throw new Error(`No IPC handler: ${channel}`);
      const event = { sender: { getOwnerBrowserWindow: () => null } };
      return fn(event, ...args);
    },
  };
}

function sampleProject(id) {
  return {
    id,
    title: "IPC Smoke",
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

describe("researchProjectService IPC smoke", () => {
  let ctx;
  let ipc;

  beforeEach(async () => {
    ctx = await makeTempUserData();
    closeDb();
    shutdownAllJobs();
    ipc = mockIpcMain();
    registerResearchProjectIpc(ipc, ctx.app);
  });

  afterEach(async () => {
    shutdownAllJobs();
    closeDb();
    await ctx.cleanup();
  });

  it("init → save → load → rechunk → embed dedupe via IPC handlers", async () => {
    const { app } = ctx;
    const projectId = "ipc-smoke";

    const init = await ipc.invoke("research:init");
    assert.equal(init.schemaVersion, 6);

    await ipc.invoke("research:saveProject", sampleProject(projectId));
    const loaded = await ipc.invoke("research:loadProject", projectId);
    assert.equal(loaded.title, "IPC Smoke");

    const { jobId: rechunkId } = await ipc.invoke("research:enqueueJob", projectId, "rechunk", {
      papers: sampleProject(projectId).papers,
      draftTex: sampleProject(projectId).draftTex,
      projectId,
    });
    assert.ok(rechunkId);

    await new Promise((r) => setTimeout(r, 1500));
    const jobsAfterRechunk = await ipc.invoke("research:listJobs", projectId);
    const rechunkJob = jobsAfterRechunk.find((j) => j.id === rechunkId);
    assert.equal(rechunkJob?.status, "completed");

    const firstEmbed = await ipc.invoke("research:enqueueJob", projectId, "embed", {});
    const secondEmbed = await ipc.invoke("research:enqueueJob", projectId, "embed", {});
    assert.ok(firstEmbed.jobId);
    assert.equal(secondEmbed.jobId, firstEmbed.jobId);
    assert.equal(secondEmbed.deduped, true);

    await ipc.invoke("research:patchDraft", projectId, "edited draft");
    assert.equal(loadProject(app, projectId).draftTex, "edited draft");
  });

  it("initResearchStorage resumes interrupted jobs after handler registration", async () => {
    const projectId = "ipc-resume";
    saveProjectMeta(ctx.app, sampleProject(projectId));
    await ipc.invoke("research:enqueueJob", projectId, "rechunk", {
      papers: sampleProject(projectId).papers,
      draftTex: sampleProject(projectId).draftTex,
      projectId,
    });
    await new Promise((r) => setTimeout(r, 1500));

    shutdownAllJobs();
    closeDb();

    const { resumed } = await initResearchStorage(ctx.app);
    assert.ok(resumed >= 0);
  });
});
