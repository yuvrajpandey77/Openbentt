import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/latexCompileClient", () => ({
  compileLatexToPdfBlob: vi.fn(async () => {
    throw new Error("all TeX engines down");
  }),
}));

vi.mock("@/lib/notebookCompileSettings", () => ({
  loadNotebookCompileSettings: () => ({ backend: "auto", applyDocumentStyle: false }),
}));

vi.mock("@/lib/research/compileArtifactCache", () => ({
  getCachedCompilePdf: vi.fn(async () => ({ hit: false })),
  storeCachedCompilePdf: vi.fn(async () => {}),
}));

import { compileNotebookSourceToPdf } from "@/lib/compileNotebook";

describe("compileNotebook text fallback", () => {
  it("still returns a PDF blob when LaTeX compile fails", async () => {
    const tex = `\\documentclass{article}\\begin{document}Hello fallback world.\\end{document}`;
    const blob = await compileNotebookSourceToPdf(tex, "Test");
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toContain("pdf");
    expect(blob.size).toBeGreaterThan(64);
  });
});
