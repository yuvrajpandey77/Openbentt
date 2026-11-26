import { beforeEach, describe, expect, it, vi } from "vitest";

describe("downloadSignup prefs", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  it("asks for signup by default", async () => {
    const { shouldAskForDownloadSignup } = await import("./downloadSignup");
    expect(shouldAskForDownloadSignup()).toBe(true);
  });

  it("stops asking after signup", async () => {
    const { rememberDownloadSignup, shouldAskForDownloadSignup } = await import("./downloadSignup");
    rememberDownloadSignup("you@example.com");
    expect(shouldAskForDownloadSignup()).toBe(false);
  });

  it("stops asking after skip until window expires", async () => {
    const { rememberDownloadSkip, shouldAskForDownloadSignup } = await import("./downloadSignup");
    rememberDownloadSkip(30);
    expect(shouldAskForDownloadSignup()).toBe(false);
  });
});
