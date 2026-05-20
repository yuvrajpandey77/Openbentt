import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installLocalStorageMock } from "../../../test/helpers/localStorage";
import {
  createResearchProject,
  deleteResearchProject,
  loadResearchProject,
  saveResearchProject,
  setActiveProjectId,
  getActiveProjectId,
} from "@/lib/research/projectStore";

describe("projectStore (web localStorage workflow)", () => {
  let restoreStorage: () => void;

  beforeEach(() => {
    vi.stubGlobal("window", {
      openbenttResearch: undefined,
      openbenttDesktop: undefined,
    });
    restoreStorage = installLocalStorageMock().restore;
  });

  afterEach(() => {
    restoreStorage();
    vi.unstubAllGlobals();
  });

  it("creates, loads, and isolates projects", async () => {
    const a = await createResearchProject("Alpha");
    const b = await createResearchProject("Beta");
    await setActiveProjectId(b.id);

    const loadedB = await loadResearchProject(b.id);
    expect(loadedB?.title).toBe("Beta");
    expect(loadedB?.draftTex).toContain("\\documentclass");

    const loadedA = await loadResearchProject(a.id);
    expect(loadedA?.id).toBe(a.id);
    expect(await getActiveProjectId()).toBe(b.id);
  });

  it("rebuilds chunks when legacy project JSON omits chunks", async () => {
    const p = await createResearchProject("Legacy");
    const legacy = {
      ...p,
      chunks: [],
      papers: [
        {
          id: "paper-1",
          fileName: "x.pdf",
          addedAt: new Date().toISOString(),
          extractedText: "Citation parsing with neural networks in PDF documents.",
          metadata: { title: "X" },
        },
      ],
    };
    await saveResearchProject(legacy);
    const reloaded = await loadResearchProject(p.id);
    expect(reloaded?.chunks.length).toBeGreaterThan(0);
    expect(reloaded?.chunks.some((c) => c.paperId === "paper-1")).toBe(true);
  });

  it("clears chunk embeddings when a new paper is added", async () => {
    const p = await createResearchProject("Embeddings");
    const withVec = {
      ...p,
      chunkEmbeddings: { "x-0": new Array(384).fill(0.1) },
      papers: [],
      chunks: [{ id: "x-0", paperId: "x", text: "t" }],
    };
    await saveResearchProject(withVec);
    const { addPaperToProject } = await import("@/lib/research/projectStore");
    const updated = await addPaperToProject(
      (await loadResearchProject(p.id))!,
      "new.pdf",
      "text",
      { title: "N" }
    );
    expect(updated.chunkEmbeddings).toBeUndefined();
    expect(updated.chunks.length).toBeGreaterThan(0);
    expect(updated.chunks.some((c) => c.paperId !== "draft")).toBe(true);
  });

  it("deletes project and reassigns active id", async () => {
    const a = await createResearchProject("Keep");
    const b = await createResearchProject("Remove");
    await setActiveProjectId(b.id);
    await deleteResearchProject(b.id);
    expect(await loadResearchProject(b.id)).toBeNull();
    const active = await getActiveProjectId();
    expect(active === a.id || active === null).toBe(true);
  });
});
