import { describe, expect, it } from "vitest";
import { applyCaption } from "@/lib/research/latexTools";

describe("applyCaption", () => {
  it("replaces caption for labeled float", () => {
    const tex = `\\begin{figure}
\\includegraphics{x}
\\caption{Old caption}
\\label{fig:main}
\\end{figure}`;
    const out = applyCaption(tex, "fig:main", "New precise caption for the main figure.");
    expect(out).toContain("New precise caption");
    expect(out).not.toContain("Old caption");
  });
});
