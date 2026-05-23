import { describe, expect, it } from "vitest";
import { displayPaperTitle, isCorruptedPaperTitle } from "@/lib/research/displayPaperLabel";

describe("displayPaperTitle", () => {
  it("prefers clean metadata title", () => {
    expect(
      displayPaperTitle({
        fileName: "paper.pdf",
        metadata: { title: "Neural Citation Parsing" },
      })
    ).toBe("Neural Citation Parsing");
  });

  it("falls back to fileName when title is a security marker", () => {
    expect(
      displayPaperTitle({
        fileName: "smith2024.pdf",
        metadata: { title: "[UNTRUSTED_DOCUMENT_START]" },
      })
    ).toBe("smith2024.pdf");
  });

  it("detects corrupted titles", () => {
    expect(isCorruptedPaperTitle("[UNTRUSTED_DOCUMENT_START]")).toBe(true);
    expect(isCorruptedPaperTitle("Real Paper Title")).toBe(false);
  });
});
