import { describe, expect, it, vi } from "vitest";
import { extractHttpsUrls, getResearchLimits } from "@/lib/researchSources";

describe("researchSources offline-safe helpers", () => {
  it("extracts https URLs without network", () => {
    const urls = extractHttpsUrls(
      "See https://example.com/paper and http://ignored.com and https://arxiv.org/abs/1234",
      5
    );
    expect(urls).toEqual(["https://example.com/paper", "https://arxiv.org/abs/1234"]);
  });

  it("defines bounded limits per depth", () => {
    const quick = getResearchLimits("quick");
    const deep = getResearchLimits("deep");
    expect(deep.maxTotalContext).toBeGreaterThan(quick.maxTotalContext);
    expect(quick.maxUrlFetch).toBeLessThan(deep.maxUrlFetch);
  });

  it("propagates network errors from research proxy client", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const { fetchResearchViaProxy } = await import("@/lib/researchProxyClient");
    await expect(fetchResearchViaProxy("http://127.0.0.1:8787", "test query", [])).rejects.toThrow();
    vi.unstubAllGlobals();
  });
});
