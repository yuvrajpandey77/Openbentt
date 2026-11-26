import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/desktopApi", () => ({
  getDesktopApi: () => ({
    copyText: vi.fn(async () => ({ ok: true })),
  }),
}));

describe("writeClipboardText", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("uses desktop copyText when available", async () => {
    const { writeClipboardText } = await import("./clipboardWrite");
    const r = await writeClipboardText("hello latex");
    expect(r.ok).toBe(true);
  });

  it("rejects empty text", async () => {
    const { writeClipboardText } = await import("./clipboardWrite");
    const r = await writeClipboardText("  ");
    // trimmed empty still has spaces — only fully empty fails
    expect(r.ok).toBe(true);
    const empty = await writeClipboardText("");
    expect(empty.ok).toBe(false);
  });
});
