import { describe, it, expect } from "vitest";
import { extractChartBlocks } from "./chartSpec";

describe("extractChartBlocks", () => {
  it("extracts chart JSON and leaves markdown text", () => {
    const md = `Hello\n\n\`\`\`cogerphere-chart\n{"kind":"bar","xKey":"x","series":[{"key":"y","name":"Y"}],"rows":[{"x":"a","y":1}]}\n\`\`\`\n\nTail`;
    const { displayText, charts } = extractChartBlocks(md);
    expect(charts).toHaveLength(1);
    expect(charts[0].kind).toBe("bar");
    expect(displayText).toContain("Hello");
    expect(displayText).toContain("Tail");
  });
});
