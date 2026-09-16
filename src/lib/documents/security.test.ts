import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { validateIngestUrl, fetchPageForIngest } from "@/lib/documents/urlIngest";
import { OfficeExtractor } from "@/lib/documents/extractors";
import { ingest, resetRegistryForTest } from "@/lib/documents/service";

async function zipBytes(files: Record<string, string>): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const [k, v] of Object.entries(files)) zip.file(k, v);
  return new Uint8Array(await zip.generateAsync({ type: "uint8array" }));
}

const DOC_XML = `<?xml version="1.0"?><w:document xmlns:w="http://x"><w:body><w:p><w:r><w:t>Hello</w:t></w:r></w:p></w:body></w:document>`;

describe("document security", () => {
  it("rejects traversal entries inside office archives", async () => {
    const bytes = await zipBytes({ "../evil.txt": "x", "word/document.xml": DOC_XML });
    await expect(new OfficeExtractor().extract({ fileName: "a.docx", mimeType: "", bytes })).rejects.toThrow("archive-traversal");
  });

  it("rejects absolute-path entries", async () => {
    const bytes = await zipBytes({ "/abs.txt": "x", "word/document.xml": DOC_XML });
    await expect(new OfficeExtractor().extract({ fileName: "a.docx", mimeType: "", bytes })).rejects.toThrow("archive-traversal");
  });

  it("rejects oversized input deterministically", async () => {
    resetRegistryForTest();
    const big = new Uint8Array(49 * 1024 * 1024);
    await expect(ingest({ fileName: "big.txt", mimeType: "text/plain", bytes: big })).rejects.toThrow("too-large");
  });

  it("url validation blocks non-https/private targets", () => {
    for (const u of ["http://example.com/", "file:///etc/passwd", "javascript:alert(1)", "data:text/html,hi",
      "https://localhost/x", "https://127.0.0.1/", "https://10.0.0.5/", "https://192.168.1.1/",
      "https://169.254.169.254/", "https://[::1]/"]) {
      expect(() => validateIngestUrl(u), u).toThrow("url-blocked");
    }
    expect(validateIngestUrl("https://example.com/paper").host).toBe("example.com");
  });

  it("url fetch enforces content-type, size cap, redirect abuse", async () => {
    const html = (t: string) => new Response(t, { status: 200, headers: { "content-type": "text/html" } });
    // Wrong content type
    await expect(fetchPageForIngest("https://example.com/x", (async () =>
      new Response("{}", { status: 200, headers: { "content-type": "application/json" } })) as unknown as typeof fetch))
      .rejects.toThrow("url-bad-content");
    // Oversize
    await expect(fetchPageForIngest("https://example.com/x", (async () =>
      html("a".repeat(3 * 1024 * 1024))) as unknown as typeof fetch, { maxBytes: 10 }))
      .rejects.toThrow("url-too-large");
    // Redirect to private network blocked
    const redir = (async () => new Response("", { status: 302, headers: { location: "https://127.0.0.1/evil" } })) as unknown as typeof fetch;
    await expect(fetchPageForIngest("https://example.com/x", redir)).rejects.toThrow("url-blocked");
    // Invalid MIME on office path is rejected at ingest
    resetRegistryForTest();
    await expect(ingest({ fileName: "evil.bin", mimeType: "application/octet-stream", text: "x" })).rejects.toThrow("unsupported-type");
  });

  it("malformed office xml fails safely (no code execution)", async () => {
    const bytes = await zipBytes({ "word/document.xml": "<not xml<" });
    // Either parses to empty blocks or throws malformed — never executes.
    const ex = new OfficeExtractor();
    try {
      const r = await ex.extract({ fileName: "a.docx", mimeType: "", bytes });
      expect(r.content.blocks.length).toBeLessThanOrEqual(5000);
    } catch (err) {
      expect((err as Error).message).toMatch(/malformed|archive/);
    }
  });
});
