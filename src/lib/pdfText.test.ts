import { createRequire } from "node:module";
import { beforeAll, describe, expect, it } from "vitest";
import { extractNotebookSourceFromPdf, extractTextFromPdfFile } from "@/lib/pdfText";
import { CORRUPTED_PDF_BYTES, MINIMAL_VALID_PDF, pdfFileFromBytes } from "../../test/fixtures/pdf";

beforeAll(async () => {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const require = createRequire(import.meta.url);
  pdfjs.GlobalWorkerOptions.workerSrc = require.resolve(
    "pdfjs-dist/legacy/build/pdf.worker.mjs"
  );
});

describe("pdfText extraction", () => {
  it("extracts text from a minimal valid PDF", async () => {
    const file = pdfFileFromBytes(MINIMAL_VALID_PDF);
    const text = await extractTextFromPdfFile(file, 10_000, 5);
    expect(text.toLowerCase()).toContain("hello");
  }, 20_000);

  it("adds page markers in notebook extraction", async () => {
    const file = pdfFileFromBytes(MINIMAL_VALID_PDF, "notebook.pdf");
    const source = await extractNotebookSourceFromPdf(file, 50_000, 5);
    expect(source).toMatch(/--- PDF PAGE 1/);
  }, 20_000);

  it("rejects corrupted PDF bytes with an error", async () => {
    const file = pdfFileFromBytes(CORRUPTED_PDF_BYTES, "bad.pdf");
    await expect(extractTextFromPdfFile(file)).rejects.toThrow();
  }, 15_000);

  it("wraps extracted text with document trust markers", async () => {
    const file = pdfFileFromBytes(MINIMAL_VALID_PDF);
    const text = await extractTextFromPdfFile(file, 10_000, 5);
    expect(text).toContain("[UNTRUSTED_DOCUMENT_START]");
    expect(text.toLowerCase()).toContain("hello");
  }, 20_000);
});
