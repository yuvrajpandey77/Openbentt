import { describe, expect, it } from "vitest";
import { buildCrossPaperSynthesis } from "@/lib/research/synthesis";
import type { ResearchPaper } from "@/types/researchProject";

function paper(id: string, text: string, year?: string): ResearchPaper {
  return {
    id,
    fileName: `${id}.pdf`,
    addedAt: "2024-01-01",
    extractedText: text,
    metadata: { title: id, year },
  };
}

describe("buildCrossPaperSynthesis", () => {
  it("returns guidance when corpus is empty", () => {
    const r = buildCrossPaperSynthesis([]);
    expect(r.paperCount).toBe(0);
    expect(r.gaps[0]).toMatch(/Upload PDFs/);
  });

  it("detects shared themes across two papers", () => {
    const shared =
      "transformer neural networks citation parsing academic PDFs research methodology experiments";
    const r = buildCrossPaperSynthesis([
      paper("a", shared.repeat(3), "2020"),
      paper("b", shared.repeat(3), "2022"),
    ]);
    expect(r.themes.length).toBeGreaterThan(0);
    expect(r.markdown).toContain("## Themes");
    expect(r.timeline.length).toBeGreaterThan(0);
  });
});
