import { describe, expect, it } from "vitest";
import { extractFromCrossref, extractFromDocument, extractFromZotero } from "@/lib/knowledge/extract";

const ref = {
  documentId: "doc_abc123", documentVersionId: "doc_abc123@v1",
  page: 4, section: "s2", block: "b1", chunkId: "doc_abc123:b1:0",
  sourceType: "pdf" as const, title: "Attention Is All You Need",
};

describe("deterministic knowledge extraction", () => {
  it("document metadata → Paper + Authors + AUTHORED_BY with evidence", () => {
    const k = extractFromDocument({
      documentId: "doc_abc123", versionId: "doc_abc123@v1", docVersion: 1,
      title: "Attention Is All You Need", authors: "Vaswani and Uszkoreit",
      year: "2017", doi: "10.48550/arXiv.1706.03762",
      journal: "NeurIPS",
      references: [{ text: "[1] LSTM Hochreiter 1997", doi: "10.1162/neco.1997.9.8.1735", page: 9 }],
      ...ref,
    });
    const paper = k.entities.find((e) => e.type === "paper" && e.status === "active");
    expect(paper?.externalIds).toContainEqual({ namespace: "doi", value: "10.48550/arxiv.1706.03762" });
    expect(k.entities.filter((e) => e.type === "person")).toHaveLength(2);
    expect(k.relationships.filter((r) => r.type === "AUTHORED_BY")).toHaveLength(2);
    expect(k.relationships.some((r) => r.type === "PUBLISHED_IN")).toBe(true);
    const cites = k.relationships.find((r) => r.type === "CITES");
    expect(cites).toBeDefined();
    // Every relationship has evidence with a SourceRef chain.
    for (const r of k.relationships) {
      const ev = k.evidence.find((e) => e.subjectType === "relationship" && e.subjectId === r.id);
      expect(ev, r.id).toBeDefined();
      expect(ev!.sourceRef.documentId).toBe("doc_abc123");
    }
    expect(k.evidence.find((e) => e.subjectId === cites!.id)?.quote).toContain("LSTM");
  });

  it("never asserts CITES without a DOI in source data", () => {
    const k = extractFromDocument({
      documentId: "doc_x", title: "T", authors: "A U Thor",
      references: [{ text: "[1] Some old paper with no identifier" }],
      chunkId: "doc_x:b0:0",
    });
    expect(k.relationships.filter((r) => r.type === "CITES")).toHaveLength(0);
  });

  it("zotero item → stable zotero:key identity + tags", () => {
    const k = extractFromZotero({
      key: "ABCD1234", title: "Paper", creators: ["Doe, Jane"], year: "2023",
      collections: ["thesis"], tags: ["nlp"], citekey: "doe2023",
    }, { documentId: "doc_abc123", chunkId: "x", sourceType: "unknown" });
    const paper = k.entities.find((e) => e.type === "paper");
    expect(paper?.externalIds).toContainEqual({ namespace: "zotero", value: "ABCD1234" });
    expect(paper?.externalIds).toContainEqual({ namespace: "citekey", value: "doe2023" });
    expect(paper?.tags).toContain("thesis");
    expect(k.entities.some((e) => e.type === "person" && e.normalizedName === "jane doe")).toBe(true);
  });

  it("crossref work → paper + publisher org", () => {
    const k = extractFromCrossref({
      doi: "10.1038/nature12373", title: "T", authors: ["A One"],
      journal: "Nature", publisher: "Springer Nature",
    }, { documentId: "doc_abc123", chunkId: "x", sourceType: "unknown" });
    expect(k.entities.some((e) => e.type === "organization" && e.canonicalName === "Springer Nature")).toBe(true);
    expect(k.relationships.some((r) => r.type === "PUBLISHED_BY")).toBe(true);
  });
});
