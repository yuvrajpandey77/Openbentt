import { describe, it, expect } from "vitest";
import {
  DESKTOP_ASSET_VERSION,
  GITHUB_REPO,
  githubReleasesLatestUrl,
  releaseAssets,
} from "./releaseDownloads";

describe("releaseDownloads", () => {
  it("has a default GitHub repo for download links", () => {
    expect(GITHUB_REPO).toMatch(/\//);
    expect(githubReleasesLatestUrl()).toContain("github.com");
    expect(githubReleasesLatestUrl()).toContain("/releases/latest");
  });

  it("uses a semver-like desktop asset version", () => {
    expect(DESKTOP_ASSET_VERSION).toMatch(/^\d+\.\d+\.\d+(-[\w.]+)?$/);
  });

  it("builds Linux AppImage URL with version segment", () => {
    const url = releaseAssets.linuxAppImage();
    expect(url).toContain(DESKTOP_ASSET_VERSION);
    expect(url).toMatch(/\.AppImage$/);
  });

  it("builds Windows and macOS artifact URLs", () => {
    expect(releaseAssets.windowsNsis()).toMatch(/\.exe$/);
    expect(releaseAssets.macDmgArm64()).toMatch(/\.dmg$/);
    expect(releaseAssets.webStaticZip()).toContain("openbentt-web-dist.zip");
  });
});
