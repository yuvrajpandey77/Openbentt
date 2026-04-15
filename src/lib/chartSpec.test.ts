import { describe, it, expect } from "vitest";
import { extractChartBlocks } from "./chartSpec";

const SAMPLE_JSON = `{"kind":"bar","xKey":"x","series":[{"key":"y","name":"Y"}],"rows":[{"x":"a","y":1}]}`;

describe("extractChartBlocks", () => {
  it("extracts openbentt-chart JSON and leaves markdown text", () => {
    const md = `Hello\n\n\`\`\`openbentt-chart\n${SAMPLE_JSON}\n\`\`\`\n\nTail`;
    const { displayText, charts } = extractChartBlocks(md);
    expect(charts).toHaveLength(1);
    expect(charts[0].kind).toBe("bar");
    expect(displayText).toContain("Hello");
    expect(displayText).toContain("Tail");
  });

  it("still parses legacy cogerphere-chart fences", () => {
    const md = `\`\`\`cogerphere-chart\n${SAMPLE_JSON}\n\`\`\``;
    const { charts } = extractChartBlocks(md);
    expect(charts).toHaveLength(1);
  });
});
