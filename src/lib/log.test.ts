import { describe, it, expect, vi, afterEach } from "vitest";
import { logger } from "./log";

afterEach(() => {
  vi.restoreAllMocks();
});

function capture() {
  const lines: string[] = [];
  vi.spyOn(console, "debug").mockImplementation((l: string) => void lines.push(l));
  vi.spyOn(console, "info").mockImplementation((l: string) => void lines.push(l));
  vi.spyOn(console, "warn").mockImplementation((l: string) => void lines.push(l));
  vi.spyOn(console, "error").mockImplementation((l: string) => void lines.push(l));
  return lines;
}

describe("logger", () => {
  it("emits structured JSON with timestamp, level, component", () => {
    const lines = capture();
    logger.info("chat", "hello", { n: 1 });
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]);
    expect(entry.level).toBe("info");
    expect(entry.component).toBe("chat");
    expect(entry.message).toBe("hello");
    expect(entry.meta).toEqual({ n: 1 });
    expect(Number.isNaN(Date.parse(entry.ts))).toBe(false);
  });

  it("redacts secret values in messages and secret keys in meta", () => {
    const lines = capture();
    logger.error("chat", "provider said no to sk-or-v1-SECRETSECRET12", { apiKey: "sk-abc" });
    const line = lines.join("\n");
    expect(line).not.toContain("SECRETSECRET12");
    expect(line).not.toContain("sk-abc");
    expect(line).toContain("[redacted-secret]");
    expect(line).toContain("[redacted]");
  });

  it("routes levels to matching console methods and never throws", () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => {
      logger.debug("c", "d");
      logger.warn("c", "w");
      logger.error("c", "e", { circular: {} as Record<string, unknown> });
    }).not.toThrow();
    expect(debugSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});
