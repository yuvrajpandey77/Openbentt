import { describe, expect, it } from "vitest";
import { ingest, resetRegistryForTest, getChunks, getDocument } from "@/lib/documents/service";
import { sourceRefForChunk, formatSourceLine, enrichHitsWithProvenance } from "@/lib/documents/provenance";
import { searchDocuments } from "@/lib/documents/search";

describe("provenance + retrieval filters", () => {
  it("every chunk carries document/version/page/section/block provenance", async () => {
    resetRegistryForTest();
    const r = await ingest({
      fileName: "paper.md", mimeType: "text/markdown", projectId: "proj1",
      text: "# Methods\n\nQuantum entanglement study with photons.\n\n# Results\n\nMeasured bell inequality violation.",
    });
    expect(r.chunks.length).toBeGreaterThan(0);
    for (const c of r.chunks) {
      expect(c.documentId).toBe(r.document.id);
      expect(c.documentVersionId).toBe(r.version.id);
      expect(typeof c.chunkIndex).toBe("number");
      expect(c.checksum).toMatch(/^[0-9a-f]{8}$/);
    }
    const ref = sourceRefForChunk(r.chunks[0], r.document);
    expect(ref.documentId).toBe(r.document.id);
    expect(ref.chunkId).toBe(r.chunks[0].id);
    expect(formatSourceLine(ref)).toContain(r.document.title);
  });

  it("search exposes document/section/page provenance with filters", async () => {
    resetRegistryForTest();
    await ingest({ fileName: "quantum.md", mimeType: "text/markdown", projectId: "p1", text: "# Methods\n\nquantum photon entanglement\n" });
    await ingest({ fileName: "cooking.txt", mimeType: "text/plain", projectId: "p2", text: "pasta recipe with tomatoes" });
    const hits = searchDocuments("quantum photon", { projectId: "p1" });
    expect(hits.length).toBe(1);
    expect(hits[0].document.title.toLowerCase()).toContain("quantum");
    expect(typeof hits[0].snippet).toBe("string");
    expect(searchDocuments("quantum", { projectId: "p2" })).toHaveLength(0);
    const byType = searchDocuments("quantum", { sourceType: "markdown" });
    expect(byType.length).toBe(1);
  });

  it("legacy hits enrich with SourceRef; missing chunks stay citation-less", async () => {
    resetRegistryForTest();
    const r = await ingest({ fileName: "a.txt", mimeType: "text/plain", text: "hello world retrieval test" });
    const chunksById = new Map(getChunks(r.document.id).map((c) => [c.id, c]));
    const docsById = new Map([[r.document.id, r.document]]);
    const doc = getDocument(r.document.id)!;
    void doc;
    const enriched = enrichHitsWithProvenance(
      [{ chunkId: r.chunks[0].id, paperId: "x", paperName: "x", snippet: "hi", score: 1 }],
      chunksById, docsById
    );
    expect(enriched[0].sourceRef?.documentId).toBe(r.document.id);
    const missing = enrichHitsWithProvenance(
      [{ chunkId: "nope", paperId: "x", paperName: "x", snippet: "hi", score: 1 }],
      chunksById, docsById
    );
    expect((missing[0] as { sourceRef?: unknown }).sourceRef).toBeUndefined();
  });
});
