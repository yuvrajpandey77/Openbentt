import { describe, expect, it } from "vitest";
import { fnv1aHex, sha256Hex, documentIdForChecksum } from "@/lib/documents/hashing";
import { ingest, resetRegistryForTest, findDuplicate, invalidateDocument, reindex } from "@/lib/documents/service";

describe("document identity/versioning/cache", () => {
  it("sha256: same content => same checksum, changed => changed", async () => {
    const a = await sha256Hex("hello");
    const b = await sha256Hex("hello");
    const c = await sha256Hex("hello!");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(fnv1aHex("x")).toMatch(/^[0-9a-f]{8}$/);
    expect(documentIdForChecksum(a).startsWith("doc_")).toBe(true);
  });

  it("duplicate import returns existing document without reprocessing", async () => {
    resetRegistryForTest();
    const first = await ingest({ fileName: "a.md", mimeType: "text/markdown", text: "# T\n\nbody" });
    const second = await ingest({ fileName: "renamed.md", mimeType: "text/markdown", text: "# T\n\nbody" });
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.document.id).toBe(first.document.id);
    expect(findDuplicate(first.document.checksum)?.id).toBe(first.document.id);
  });

  it("invalidate drops chunks and reindex rebuilds from same version (no mixing)", async () => {
    resetRegistryForTest();
    const r = await ingest({ fileName: "a.txt", mimeType: "text/plain", text: "hello world ".repeat(100) });
    expect(r.chunks.length).toBeGreaterThan(0);
    const versionBefore = r.document.version;
    invalidateDocument(r.document.id);
    const { getChunks } = await import("@/lib/documents/service");
    expect(getChunks(r.document.id)).toHaveLength(0);
    const rebuilt = reindex(r.document.id);
    expect(rebuilt.length).toBeGreaterThan(0);
    expect(rebuilt.every((c) => c.documentVersionId === `${r.document.id}@v${versionBefore}`)).toBe(true);
  });
});
