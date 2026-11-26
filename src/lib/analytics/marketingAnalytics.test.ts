import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@vercel/analytics", () => ({
  track: vi.fn(),
}));

vi.mock("@/lib/isDesktopApp", () => ({
  isDesktopApp: () => false,
}));

describe("trackDownloadClick", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("sends download_click to Vercel Analytics with asset metadata", async () => {
    const { track } = await import("@vercel/analytics");
    const { trackDownloadClick } = await import("./marketingAnalytics");

    trackDownloadClick({
      assetId: "linux-appimage",
      platform: "linux",
      version: "2.6.4",
      source: "download_page",
      href: "https://github.com/yuvrajpandey77/Openbentt/releases/download/v2.6.4/Openbentt-2.6.4.AppImage",
    });

    expect(track).toHaveBeenCalledWith(
      "download_click",
      expect.objectContaining({
        asset_id: "linux-appimage",
        platform: "linux",
        version: "2.6.4",
        source: "download_page",
      })
    );
  });
});
