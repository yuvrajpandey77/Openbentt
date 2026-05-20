import { describe, expect, it } from "vitest";
import { bibEntriesFromGraphNodes } from "@/lib/research/citationGraphSync";
import type { GraphNode } from "@/lib/citationGraph";

describe("citationGraphSync", () => {
  it("imports Semantic Scholar nodes not already in bib", () => {
    const nodes: GraphNode[] = [
      { id: "paper1", label: "Local paper", doi: "10.1/abc" },
      { id: "s2:abc123", label: "Related work from S2" },
    ];
    const { entries, bib } = bibEntriesFromGraphNodes(nodes, "@article{paper1, title={Local}}");
    expect(entries.length).toBe(1);
    expect(entries[0].key).toMatch(/^s2/);
    expect(bib).toContain("Related work from S2");
  });

  it("skips when s2 key already present", () => {
    const nodes: GraphNode[] = [{ id: "s2:dup", label: "Dup" }];
    const { entries } = bibEntriesFromGraphNodes(nodes, "@misc{s2dup, title={Dup}}");
    expect(entries.length).toBe(0);
  });
});
