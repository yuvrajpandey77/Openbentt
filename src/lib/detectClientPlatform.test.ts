import { describe, expect, it, vi, afterEach } from "vitest";
import { getClientPlatform } from "./detectClientPlatform";

describe("getClientPlatform", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("detects Windows", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" });
    expect(getClientPlatform()).toBe("windows");
  });

  it("detects macOS", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" });
    expect(getClientPlatform()).toBe("mac");
  });

  it("detects Linux", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (X11; Linux x86_64)" });
    expect(getClientPlatform()).toBe("linux");
  });
});
