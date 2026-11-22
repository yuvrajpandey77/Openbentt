import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/pdfText", () => ({
  extractNotebookSourceFromPdf: vi.fn(async () => "--- PDF PAGE 1 / 1 ---\n\n"),
}));

vi.mock("@/lib/documents/pdfPageExtract", () => ({
  extractPdfPageInputs: vi.fn(async () => ({
    pages: [{ pageNumber: 1, text: "", empty: true }],
    totalPages: 1,
    truncated: false,
  })),
}));

vi.mock("@/lib/documents/ocr", () => ({
  isOcrRequired: vi.fn(() => true),
  canRetryOcr: vi.fn(async () => true),
  ocrPdfBytes: vi.fn(async () => [{ pageNumber: 1, text: "Hello OCR", empty: false }]),
}));

vi.mock("@/lib/documents/service", () => ({
  ingestPdfPages: vi.fn(async () => ({
    document: { id: "d1", status: "extracted" },
    ocrApplied: true,
  })),
}));

describe("extractResearchPdfWithOcr", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("applies OCR and passes pdfBytes to ingestPdfPages", async () => {
    const { extractResearchPdfWithOcr } = await import("@/lib/documents/pdfOcrIngest");
    const { ingestPdfPages } = await import("@/lib/documents/service");
    const { ocrPdfBytes } = await import("@/lib/documents/ocr");

    const buf = new ArrayBuffer(8);
    const r = await extractResearchPdfWithOcr(buf, "scan.pdf", { projectId: "p1" });

    expect(r.ocrApplied).toBe(true);
    expect(r.text).toContain("Hello OCR");
    expect(ocrPdfBytes).toHaveBeenCalled();
    expect(ingestPdfPages).toHaveBeenCalledWith(
      "scan.pdf",
      expect.objectContaining({ totalPages: 1 }),
      expect.objectContaining({
        projectId: "p1",
        pdfBytes: expect.any(Uint8Array),
      }),
    );
  });
});
