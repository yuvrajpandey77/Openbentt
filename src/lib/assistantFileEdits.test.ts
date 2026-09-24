import { describe, it, expect } from "vitest";
import {
  buildLatexEditContract,
  extractBibKeysFromBibliography,
  parseAssistantFileEdits,
  validateAssistantFileEdits,
} from "./assistantFileEdits";

describe("assistantFileEdits contract", () => {
  it("builds a contract naming allowed files and valid cite keys", () => {
    const c = buildLatexEditContract({
      allowedFiles: ["main.tex", "chapter3.tex", "references.bib"],
      citeKeys: ["smith2020", "doe2021"],
      mainTex: "main.tex",
      buildDir: "build",
    });
    expect(c).toContain("FILE: main.tex");
    expect(c).toContain("chapter3.tex");
    expect(c).toContain("smith2020, doe2021");
    expect(c).toContain("Never invent keys");
  });

  it("parses file-edit fences with FILE headers", () => {
    const reply = [
      "I rewrote the results:",
      "```file-edit",
      "FILE: chapter3.tex",
      "\\section{Results}",
      "New text \\cite{smith2020}.",
      "```",
      "And the bib:",
      "```file-edit",
      "FILE: references.bib",
      "@article{smith2020, author={Smith}}",
      "```",
    ].join("\n");
    const edits = parseAssistantFileEdits(reply);
    expect(edits).toHaveLength(2);
    expect(edits[0].path).toBe("chapter3.tex");
    expect(edits[0].content).toContain("\\section{Results}");
    expect(edits[1].path).toBe("references.bib");
  });

  it("accepts latex fences with a leading FILE line, ignores drafts without one", () => {
    expect(parseAssistantFileEdits("```latex\nFILE: main.tex\n\\documentclass{article}\n```")).toHaveLength(1);
    // Legacy whole-document draft: NOT an edit (old Apply-reply flow untouched).
    expect(parseAssistantFileEdits("```latex\n\\documentclass{article}\nHello\n```")).toHaveLength(0);
    expect(parseAssistantFileEdits("Just a conversational reply, no fences.")).toHaveLength(0);
  });

  it("validates paths: traversal, absolute, extensions, allowlist", () => {
    const bad = parseAssistantFileEdits("```file-edit\nFILE: ../evil.tex\nx\n```");
    expect(validateAssistantFileEdits(bad, ["main.tex"]).some((p) => /Blocked path|Not in editable/.test(p))).toBe(true);
    expect(
      validateAssistantFileEdits([{ path: "/etc/passwd", content: "x" }], null).some((p) => /Blocked path/.test(p))
    ).toBe(true);
    expect(
      validateAssistantFileEdits([{ path: "run.sh", content: "x" }], null).some((p) => /Blocked extension/.test(p))
    ).toBe(true);
    expect(
      validateAssistantFileEdits([{ path: "other.tex", content: "x" }], ["main.tex"]).some((p) =>
        /Not in editable/.test(p)
      )
    ).toBe(true);
    expect(validateAssistantFileEdits([{ path: "main.tex", content: "hello" }], ["main.tex", "references.bib"])).toEqual(
      []
    );
  });

  it("extracts bib keys from .bib text", () => {
    const bib = "@article{smith2020,\n author={S}\n}\n\n@book{doe2021,\n title={T}\n}";
    const keys = extractBibKeysFromBibliography(bib);
    expect(keys).toContain("smith2020");
    expect(keys).toContain("doe2021");
    expect(extractBibKeysFromBibliography("not a bib file")).toEqual([]);
  });
});
