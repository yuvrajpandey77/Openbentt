import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ingest, resetRegistryForTest } from "@/lib/documents/service";

function fixture(name: string): string {
  return fs.readFileSync(path.join(process.cwd(), "test/fixtures/documents", name), "utf8");
}

/** Reproducible benchmark — real measured timings, printed, never fabricated. */
describe("document benchmark", () => {
  it("measures ingest across fixtures", async () => {
    resetRegistryForTest();
    const cases: { name: string; file: string; mime: string }[] = [
      { name: "markdown", file: "sample.md", mime: "text/markdown" },
      { name: "text", file: "sample.txt", mime: "text/plain" },
      { name: "html", file: "sample.html", mime: "text/html" },
    ];
    // Synthetic medium PDF-equivalent: 60 pages of text through the pdf path.
    const { ingestPdfPages } = await import("@/lib/documents/service");
    const rows: string[] = [];
    for (const c of cases) {
      const text = fixture(c.file);
      const t0 = performance.now();
      const r = await ingest({ fileName: c.file, mimeType: c.mime, text });
      const dt = performance.now() - t0;
      rows.push(`${c.name}: ingest ${dt.toFixed(1)}ms, blocks ${r.chunks.length}, chars ${text.length}`);
      expect(r.document.status).toBe("ready");
    }
    const pages = Array.from({ length: 60 }, (_, i) => ({
      pageNumber: i + 1, text: `Page ${i + 1} content `.repeat(40), empty: false,
    }));
    const t0 = performance.now();
    const pdf = await ingestPdfPages("medium.pdf", { pages, totalPages: 60 });
    const dt = performance.now() - t0;
    rows.push(`pdf-60p: ingest ${dt.toFixed(1)}ms, chunks ${pdf.chunks.length}`);
    expect(pdf.document.status).toBe("ready");
    console.log(`[doc-bench]\n${rows.join("\n")}`);
  }, 30000);
});
