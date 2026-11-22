import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  LocalOcrProvider,
  UnavailableOcrProvider,
  getOcrProvider,
  resetOcrProviderCacheForTest,
  isOcrRequired,
} from "@/lib/documents/ocr";

describe("LocalOcrProvider", () => {
  beforeEach(() => {
    resetOcrProviderCacheForTest();
    vi.unstubAllGlobals();
  });

  it("UnavailableOcrProvider never supports mime types", () => {
    const p = new UnavailableOcrProvider();
    expect(p.supports("image/png")).toBe(false);
  });

  it("isOcrRequired flags empty multi-page PDFs", () => {
    expect(isOcrRequired([{ pageNumber: 1, text: "", charCount: 0, empty: true }], 3)).toBe(true);
  });

  it("getOcrProvider picks local when desktop OCR IPC exists", async () => {
    vi.stubGlobal("window", {
      openbenttDesktop: {
        isElectron: true,
        documentsOcr: vi.fn(),
        documentsOcrStatus: vi.fn().mockResolvedValue({ available: true }),
      },
    });
    const p = await getOcrProvider();
    expect(p.name).toBe("local-tesseract");
  });

  it("LocalOcrProvider forwards single image to IPC", async () => {
    const documentsOcr = vi.fn().mockResolvedValue({ text: "hello", pages: [{ pageNumber: 1, text: "hello" }] });
    vi.stubGlobal("window", {
      openbenttDesktop: {
        isElectron: true,
        documentsOcr,
        documentsOcrStatus: vi.fn().mockResolvedValue({ available: true }),
      },
    });
    const p = new LocalOcrProvider();
    const r = await p.recognize(new Uint8Array([1, 2, 3]), "image/png");
    expect(r.text).toBe("hello");
    expect(documentsOcr).toHaveBeenCalledOnce();
  });
});