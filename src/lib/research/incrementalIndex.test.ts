import { describe, expect, it } from "vitest";
import type { CorpusChunk } from "@/types/researchProject";
import { listChunksPendingEmbed, planIncrementalIndex, pruneStaleEmbeddings } from "@/lib/research/incrementalIndex";

const chunks: CorpusChunk[] = [
  { id: "c1", paperId: "p1", text: "alpha" },
  { id: "c2", paperId: "p1", text: "beta" },
  { id: "d1", paperId: "draft", text: "draft chunk" },
];

describe("incrementalIndex", () => {
  it("lists only library chunks missing embeddings", () => {
    const pending = listChunksPendingEmbed(chunks, { c1: [0.1, 0.2] });
    expect(pending.map((c) => c.id)).toEqual(["c2"]);
  });

  it("prunes vectors for removed chunk ids", () => {
    const pruned = pruneStaleEmbeddings(chunks, { c1: [1], c99: [2] });
    expect(Object.keys(pruned)).toEqual(["c1"]);
  });

  it("plans incremental work with skip counts", () => {
    const plan = planIncrementalIndex(chunks, { c1: [1], c99: [2] });
    expect(plan.pending).toHaveLength(1);
    expect(plan.skipped).toBe(1);
    expect(plan.pruned).toBe(1);
  });
});
