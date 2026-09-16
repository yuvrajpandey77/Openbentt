import { describe, expect, it } from "vitest";
import { MarkdownExtractor, PlainTextExtractor, HtmlExtractor, buildPdfContent, pickExtractor } from "@/lib/documents/extractors";
import { detectSections } from "@/lib/documents/structure";
import { chunkDocumentBlocks, CHUNK_SIZE, CHUNK_OVERLAP } from "@/lib/documents/chunking";
import { chunkText } from "@/lib/research/corpusChunksCore.mjs";

describe("document extraction", () => {
  it("preserves RAG chunk constants", () => {
    expect(CHUNK_SIZE).toBe(480);
    expect(CHUNK_OVERLAP).toBe(80);
    expect(chunkText("a ".repeat(1000)).every((c) => c.length <= 480)).toBe(true);
  });

  it("markdown preserves headings/lists/code/links/tables", async () => {
    const md = `# Methods\n\nIntro with [link](https://example.com).\n\n- a\n- b\n\n\`\`\`ts\nconst x = 1;\n\`\`\`\n\n| h1 | h2 |\n| --- | --- |\n| a | b |\n`;
    const r = await new MarkdownExtractor().extract({ fileName: "m.md", mimeType: "text/markdown", text: md });
    expect(r.status).toBe("extracted");
    expect(r.content.blocks.some((b) => b.kind === "heading" && b.text === "Methods")).toBe(true);
    expect(r.content.blocks.some((b) => b.kind === "list")).toBe(true);
    expect(r.content.blocks.some((b) => b.kind === "code")).toBe(true);
    const table = r.content.blocks.find((b) => b.kind === "table");
    expect(table?.table?.columns).toEqual(["h1", "h2"]);
    expect(table?.table?.rows).toEqual([["a", "b"]]);
  });

  it("plaintext preserves line boundaries", async () => {
    const r = await new PlainTextExtractor().extract({ fileName: "a.txt", mimeType: "text/plain", text: "line one\nline two" });
    expect(r.content.blocks.map((b) => b.text)).toEqual(["line one", "line two"]);
  });

  it("html reduces boilerplate and never executes scripts", async () => {
    const html = `<html><head><title>T</title><script>alert(1)</script></head><body><nav>menu</nav><h1>Hi</h1><p>Hello world</p></body></html>`;
    const r = await new HtmlExtractor().extract({ fileName: "p.html", mimeType: "text/html", text: html });
    expect(r.status).toBe("extracted");
    expect(r.content.blocks.map((b) => b.text).join(" ")).toContain("Hello world");
    expect(r.content.blocks.map((b) => b.text).join(" ")).not.toContain("alert");
    expect(r.content.blocks.map((b) => b.text).join(" ")).not.toContain("menu");
  });

  it("pdf wrapper reports ocr-required for empty pages, never extracted", () => {
    const r = buildPdfContent(
      [{ pageNumber: 1, text: "", empty: true }, { pageNumber: 2, text: "  ", empty: true }],
      2, "scan.pdf", "application/pdf", 10
    );
    expect(r.status).toBe("ocr-required");
  });

  it("pdf wrapper marks truncation as partial and keeps page spans", () => {
    const r = buildPdfContent(
      [{ pageNumber: 1, text: "Abstract\nSome content here", empty: false }],
      5, "paper.pdf", "application/pdf", 100, { truncated: true }
    );
    expect(r.status).toBe("partial");
    expect(r.content.pages[0].pageNumber).toBe(1);
    expect(r.content.blocks[0].page).toBe(1);
  });

  it("structure groups headings into sections; chunking attaches provenance", () => {
    const content = {
      pages: [], references: [],
      sections: [],
      blocks: [
        { id: "b0", kind: "heading" as const, text: "Methods", level: 1 },
        { id: "b1", kind: "paragraph" as const, text: "x ".repeat(300), page: 14 },
      ],
    };
    const sections = detectSections(content);
    expect(sections).toHaveLength(1);
    const chunks = chunkDocumentBlocks(content.blocks, { documentId: "doc_1", documentVersionId: "doc_1@v1" });
    expect(chunks.length).toBeGreaterThan(0);
    for (const c of chunks) {
      expect(c.documentId).toBe("doc_1");
      expect(c.documentVersionId).toBe("doc_1@v1");
      expect(typeof c.id).toBe("string");
      expect(typeof c.checksum).toBe("string");
    }
    expect(chunks.find((c) => c.blockId === "b1")?.page).toBe(14);
    expect(chunks.find((c) => c.blockId === "b1")?.sectionId).toBe("s0");
  });

  it("pickExtractor routes by filename/mime", () => {
    expect(pickExtractor({ fileName: "a.md", mimeType: "" })?.name).toBe("markdown");
    expect(pickExtractor({ fileName: "a.txt", mimeType: "text/plain" })?.name).toBe("plaintext");
    expect(pickExtractor({ fileName: "a.html", mimeType: "text/html" })?.name).toBe("html");
    expect(pickExtractor({ fileName: "a.docx", mimeType: "" })?.name).toBe("office");
    expect(pickExtractor({ fileName: "a.bin", mimeType: "application/octet-stream" })).toBeNull();
  });
});
