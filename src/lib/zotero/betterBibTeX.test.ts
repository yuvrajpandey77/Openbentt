import { describe, expect, it } from "vitest";
import {
  applyConflictResolutions,
  detectBetterBibTeX,
  mergeBibliographies,
} from "@/lib/zotero/betterBibTeX";
import { MOCK_BBT_BIB } from "@/lib/zotero/mockZotero";

describe("betterBibTeX merge", () => {
  it("detects BBT exports", () => {
    expect(detectBetterBibTeX(MOCK_BBT_BIB)).toBe(true);
    expect(detectBetterBibTeX("@article{a, title={T}}")).toBe(false);
  });

  it("merges new remote entries without clobbering local-only keys", () => {
    const local = "@article{localOnly, title={Local Paper}, author={A}, year={2020}}";
    const { bibliography, conflicts } = mergeBibliographies(local, MOCK_BBT_BIB, {
      preferIncoming: true,
    });
    expect(bibliography).toContain("localOnly");
    expect(bibliography).toContain("vaswani2017attention");
    expect(conflicts.length).toBe(0);
  });

  it("records partial sync conflicts when same citekey differs", () => {
    const local = `@article{vaswani2017attention,
  title={Local title differs},
  author={Someone Else},
  year={2016}
}`;
    const { conflicts, warnings } = mergeBibliographies(local, MOCK_BBT_BIB, {
      preferIncoming: false,
    });
    expect(conflicts.some((c) => c.citekey === "vaswani2017attention")).toBe(true);
    expect(warnings.some((w) => /Conflict on citekey/)).toBe(true);
  });

  it("applies user conflict resolution to produce merged bib", () => {
    const local = `@article{vaswani2017attention, title={Local}, year={2016}}`;
    const { conflicts } = mergeBibliographies(local, MOCK_BBT_BIB, { preferIncoming: false });
    const resolved = applyConflictResolutions(local, MOCK_BBT_BIB, [
      { ...conflicts[0], resolution: "keep-remote" },
    ]);
    expect(resolved).toContain("Attention Is All You Need");
  });
});
