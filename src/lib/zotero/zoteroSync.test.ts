import { describe, expect, it } from "vitest";
import { buildSyncResult } from "@/lib/zotero/zoteroSync";
import { buildMockZoteroSnapshot, MOCK_BBT_BIB } from "@/lib/zotero/mockZotero";
import { recommendCitations } from "@/lib/zotero/zoteroRetrieval";

describe("zoteroSync", () => {
  it("builds partial sync result when bibliography merge warns", () => {
    const snapshot = {
      ...buildMockZoteroSnapshot(),
      bibliography: MOCK_BBT_BIB,
      mode: "better-bibtex" as const,
    };
    const local = `@article{vaswani2017attention, title={Conflict}, year={2000}}`;
    const result = buildSyncResult(snapshot, local, false);
    expect(result.ok).toBe(true);
    expect(result.partial).toBe(true);
    expect(result.conflicts.length).toBeGreaterThan(0);
    expect(result.bibliography).toContain("vaswani2017attention");
  });

  it("recommends citations from mock library for transformer draft", () => {
    const snapshot = buildMockZoteroSnapshot();
    const recs = recommendCitations(
      snapshot,
      "Our draft extends the Transformer architecture for citation parsing.",
      { limit: 5 }
    );
    expect(recs.length).toBeGreaterThan(0);
    expect(recs[0].citekey).toBeTruthy();
    expect(recs[0].score).toBeGreaterThan(0);
  });
});
