import { describe, expect, it } from "vitest";
import {
  detectBetterBibTeX,
  mergeBibliographies,
  citekeyFromBibEntry,
} from "@/lib/zotero/betterBibTeX";
import { parseBibtex } from "@/lib/bibtex";
import { buildMockZoteroSnapshot, MOCK_BBT_BIB, createMockZoteroFetch } from "@/lib/zotero/mockZotero";
import {
  mapZoteroApiToSnapshot,
  zoteroFetchAllItems,
  zoteroFetchCollections,
  zoteroWhoami,
} from "@/lib/zotero/zoteroWebApi";
import { buildSyncResult } from "@/lib/zotero/zoteroSync";
import { recommendCitations, literatureReviewContext } from "@/lib/zotero/zoteroRetrieval";
import { searchAnnotations, resolveAnnotationSource } from "@/lib/zotero/annotationIndex";
import {
  MOCK_ZOTERO_API_ITEMS,
  MOCK_ZOTERO_COLLECTIONS,
  MOCK_ZOTERO_TAGS,
} from "@/lib/zotero/mockZotero";

describe("Zotero Web API mapping", () => {
  it("maps API items to library snapshot with annotations", () => {
    const mapped = mapZoteroApiToSnapshot(
      MOCK_ZOTERO_API_ITEMS,
      MOCK_ZOTERO_COLLECTIONS,
      MOCK_ZOTERO_TAGS,
      "12345"
    );
    expect(mapped.items).toHaveLength(2);
    expect(mapped.items[0].citekey).toBe("vaswani2017attention");
    expect(mapped.annotations).toHaveLength(1);
    expect(mapped.annotations[0].text).toContain("Multi-head attention");
    expect(mapped.collections[0].name).toBe("Deep Learning");
  });

  it("mock fetch completes auth and item sync path", async () => {
    const fetchFn = createMockZoteroFetch();
    const who = await zoteroWhoami(fetchFn, "test-key");
    expect(who.username).toBe("mockuser");
    const items = await zoteroFetchAllItems(fetchFn, "12345", "test-key");
    expect(items.length).toBeGreaterThan(0);
    const cols = await zoteroFetchCollections(fetchFn, "12345", "test-key");
    expect(cols[0].data.name).toBe("Deep Learning");
  });
});

describe("Better BibTeX citekey handling", () => {
  it("detects BBT export", () => {
    expect(detectBetterBibTeX(MOCK_BBT_BIB)).toBe(true);
    expect(detectBetterBibTeX("@article{a, title={T}}")).toBe(false);
  });

  it("preserves citationKey from BBT entries", () => {
    const entry = parseBibtex(MOCK_BBT_BIB)[0];
    expect(citekeyFromBibEntry(entry)).toBe("vaswani2017attention");
  });

  it("merges bibliographies with conflict tracking", () => {
    const local = `@article{vaswani2017attention, title={Local Title}, author={A}, year={2017}}`;
    const { bibliography, conflicts } = mergeBibliographies(local, MOCK_BBT_BIB, {
      preferIncoming: true,
      preserveCitekeys: true,
    });
    expect(bibliography).toContain("Attention Is All You Need");
    expect(conflicts.some((c) => c.citekey === "vaswani2017attention")).toBe(true);
  });
});

describe("Zotero sync into project bibliography", () => {
  it("builds sync result from snapshot", () => {
    const snapshot = buildMockZoteroSnapshot();
    const result = buildSyncResult(snapshot, "");
    expect(result.ok).toBe(true);
    expect(result.bibliography).toContain("vaswani2017attention");
    expect(result.snapshot?.itemCount).toBe(2);
  });
});

describe("Zotero AI retrieval", () => {
  it("recommends citations from library for draft context", () => {
    const snapshot = buildMockZoteroSnapshot();
    const recs = recommendCitations(snapshot, "transformer attention mechanism NLP", { limit: 5 });
    expect(recs.length).toBeGreaterThan(0);
    expect(recs[0].citekey).toBeTruthy();
    expect(recs[0].provenance).toContain("Zotero");
  });

  it("filters by collection", () => {
    const snapshot = buildMockZoteroSnapshot();
    const recs = recommendCitations(snapshot, "transformer", {
      collectionKeys: ["COL1"],
      limit: 5,
    });
    expect(recs.every((r) => r.collections.includes("Deep Learning"))).toBe(true);
  });

  it("builds literature review context block", () => {
    const snapshot = buildMockZoteroSnapshot();
    const ctx = literatureReviewContext(snapshot, { topic: "attention transformers" });
    expect(ctx).toContain("vaswani2017attention");
    expect(ctx).toContain("Zotero library sources");
  });
});

describe("Annotation ingestion and search", () => {
  it("searches annotations semantically", () => {
    const snapshot = buildMockZoteroSnapshot();
    const hits = searchAnnotations(snapshot, "multi-head attention", 5);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].citekey).toBe("vaswani2017attention");
  });

  it("resolves annotation source item", () => {
    const snapshot = buildMockZoteroSnapshot();
    const annKey = snapshot.annotations[0]?.key;
    expect(annKey).toBeTruthy();
    const { item, annotation } = resolveAnnotationSource(snapshot, annKey!);
    expect(annotation?.text).toContain("Multi-head");
    expect(item?.title).toContain("Attention");
  });
});
