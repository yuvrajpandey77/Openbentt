import { describe, it, expect, vi, afterEach } from "vitest";
import { ByteDownloadTracker, formatBytes, formatEta, formatSpeed } from "./downloadProgress";

describe("formatBytes", () => {
  it("formats GiB and MiB", () => {
    expect(formatBytes(1024 ** 3)).toContain("GiB");
    expect(formatBytes(50 * 1024 ** 2)).toContain("MiB");
  });
});

describe("formatSpeed", () => {
  it("formats MiB/s for fast downloads", () => {
    expect(formatSpeed(3 * 1024 ** 2)).toBe("3.0 MiB/s");
  });
});

describe("formatEta", () => {
  it("formats seconds and minutes", () => {
    expect(formatEta(45)).toBe("45s left");
    expect(formatEta(125)).toContain("m");
  });
});

describe("ByteDownloadTracker", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("computes percent and speed from byte ticks", () => {
    vi.useFakeTimers();
    const t = new ByteDownloadTracker();
    const t0 = Date.now();
    vi.setSystemTime(t0);
    t.tick(0, 1000);
    vi.setSystemTime(t0 + 1000);
    const snap = t.tick(500_000, 1_000_000);
    expect(snap.percent).toBe(50);
    expect(snap.received).toBe(500_000);
    expect(snap.speedBps).toBeGreaterThan(0);
    expect(snap.etaSeconds).toBeGreaterThan(0);
  });
});
