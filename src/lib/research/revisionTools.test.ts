import { describe, expect, it } from "vitest";
import { applyRevisionPatch, buildRevisionPatch, parseReviewerComments } from "./revisionTools";

describe("revisionTools", () => {
  it("parses numbered reviewer blocks", () => {
    const items = parseReviewerComments("1. Fix the abstract.\n2. Add citations.");
    expect(items.length).toBe(2);
    expect(items[0].status).toBe("pending");
  });

  it("builds a patch after begin document", () => {
    const tex = "\\documentclass{article}\n\\begin{document}\nHello\n\\end{document}";
    const suggestion = parseReviewerComments("1. Expand methods")[0];
    const { after } = buildRevisionPatch(tex, suggestion);
    expect(after).toContain("\\begin{document}");
    expect(after).toContain("% [REVIEW");
    expect(applyRevisionPatch(tex, suggestion)).toBe(after);
  });
});
