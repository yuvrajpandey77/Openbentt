import { describe, expect, it } from "vitest";
import {
  looksLikePdfExtractInEditor,
  migrateProjectIntegrity,
  pickCleanDraftHistoryEntry,
} from "@/lib/research/contentIntegrity";

describe("contentIntegrity", () => {
  it("detects PDF extract in editor buffer", () => {
    expect(looksLikePdfExtractInEditor("[UNTRUSTED_DOCUMENT_START]\nfoo")).toBe(true);
    expect(looksLikePdfExtractInEditor("--- PDF PAGE 1 / 3 ---\n\nIntro")).toBe(true);
    expect(looksLikePdfExtractInEditor("\\documentclass{article}\n\\begin{document}")).toBe(false);
  });

  it("repairs corrupted paper titles on migration", () => {
    const report = migrateProjectIntegrity({
      id: "p1",
      title: "Test",
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
      targetVenue: "generic",
      linkedThreadIds: [],
      draftTex: "",
      bibliography: "",
      bibEntries: [],
      papers: [
        {
          id: "paper1",
          fileName: "neural.pdf",
          addedAt: "2026-01-01",
          extractedText: "Neural Citation Parsing\nSmith, Jane\n2024",
          metadata: { title: "[UNTRUSTED_DOCUMENT_START]" },
        },
      ],
      chunks: [],
      revisionSuggestions: [],
      modelAttributions: [],
      abstractVariants: [],
      keywordSuggestions: [],
      captionSuggestions: [],
    });
    expect(report.repairedPaperTitles).toBe(1);
    expect(report.project.papers[0]?.metadata.title).toBe("Neural Citation Parsing");
    expect(report.changed).toBe(true);
  });

  it("picks clean draft history entry", () => {
    const pick = pickCleanDraftHistoryEntry([
      { id: "bad", content: "--- PDF PAGE 1 / 2 ---\n", createdAt: "2026-02-01" },
      { id: "good", content: "\\documentclass{article}", createdAt: "2026-01-01" },
    ]);
    expect(pick?.id).toBe("good");
  });
});
