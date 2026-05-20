import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as embeddingIndex from "@/lib/research/embeddingIndex";
import { startSemanticIndexRebuild } from "@/lib/research/semanticIndexRebuild";
import { loadIndexCheckpoint, saveIndexCheckpoint } from "@/lib/research/indexCheckpoint";
import { installLocalStorageMock } from "../../../test/helpers/localStorage";
import type { CorpusChunk } from "@/types/researchProject";

const libraryChunk: CorpusChunk = {
  id: "p1-0",
  paperId: "p1",
  text: "Neural citation parsing in academic PDFs.",
};

describe("startSemanticIndexRebuild", () => {
  let restoreStorage: () => void;

  beforeEach(() => {
    restoreStorage = installLocalStorageMock().restore;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    restoreStorage();
  });

  it("returns empty object when library has no chunks", async () => {
    const draftOnly: CorpusChunk = { id: "draft-0", paperId: "draft", text: "draft text" };
    const { promise } = startSemanticIndexRebuild([draftOnly], "proj-empty");
    await expect(promise).resolves.toEqual({});
  });

  it("returns null when indexing is aborted", async () => {
    vi.spyOn(embeddingIndex, "buildChunkEmbeddings").mockImplementation(
      async (_chunks, _onProgress, signal) => {
        await new Promise((r) => setTimeout(r, 30));
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        return { "p1-0": [1, 0, 0] };
      }
    );

    const ctrl = startSemanticIndexRebuild([libraryChunk], "proj-abort");
    ctrl.abort();
    await expect(ctrl.promise).resolves.toBeNull();
  });

  it("resumes from checkpoint after model failure then succeeds", async () => {
    const projectId = "proj-retry";
    saveIndexCheckpoint({
      projectId,
      vectors: { "p1-0": [0.5, 0.5, 0] },
      doneIds: ["p1-0"],
      total: 1,
      updatedAt: new Date().toISOString(),
    });

    let calls = 0;
    vi.spyOn(embeddingIndex, "buildChunkEmbeddings").mockImplementation(async () => {
      calls += 1;
      if (calls === 1) throw new Error("ONNX load failed");
      return { "p1-0": [1, 0, 0] };
    });

    const { promise } = startSemanticIndexRebuild([libraryChunk], projectId);
    await expect(promise).resolves.toEqual({ "p1-0": [1, 0, 0] });
    expect(loadIndexCheckpoint(projectId)).toBeNull();
  });

  it("rethrows after retries exhausted", async () => {
    vi.spyOn(embeddingIndex, "buildChunkEmbeddings").mockRejectedValue(new Error("ONNX load failed"));
    const { promise } = startSemanticIndexRebuild([libraryChunk], "proj-fail");
    await expect(promise).rejects.toThrow(/ONNX load failed/);
  });
});
