import { describe, expect, it } from "vitest";
import {
  evaluateGgufDownload,
  filterGgufFileNames,
  parseParamBillions,
  normalizeGgufMaxParamB,
} from "./guardrails";

describe("guardrails", () => {
  it("parses parameter sizes from names", () => {
    expect(parseParamBillions("org/Llama-3.2-3B-GGUF", "x-Q4_K_M.gguf")).toBe(3);
    expect(parseParamBillions("Qwen/Qwen2.5-7B", "qwen2.5-7b-q4.gguf")).toBe(7);
    expect(parseParamBillions("x/y", "weights.gguf")).toBeNull();
  });

  it("blocks models above policy param cap", () => {
    const v = evaluateGgufDownload({
      repoId: "org/Llama-70B-GGUF",
      fileName: "llama-70b-q4.gguf",
      fileSizeBytes: 40 * 1024 ** 3,
      policy: { maxParamB: 8 },
    });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toMatch(/70/);
  });

  it("blocks huge files when param unknown", () => {
    const v = evaluateGgufDownload({
      repoId: "some/model",
      fileName: "unknown.gguf",
      fileSizeBytes: 10 * 1024 ** 3,
      policy: { maxParamB: 8 },
    });
    expect(v.ok).toBe(false);
  });

  it("allows small curated-style files", () => {
    const v = evaluateGgufDownload({
      repoId: "bartowski/Llama-3.2-3B-Instruct-GGUF",
      fileName: "Llama-3.2-3B-Instruct-Q4_K_M.gguf",
      fileSizeBytes: 2 * 1024 ** 3,
      policy: { maxParamB: 8 },
    });
    expect(v.ok).toBe(true);
  });

  it("normalizes max param policy", () => {
    expect(normalizeGgufMaxParamB(16)).toBe(16);
    expect(normalizeGgufMaxParamB(8)).toBe(8);
    expect(normalizeGgufMaxParamB(99)).toBe(16);
    expect(normalizeGgufMaxParamB(undefined)).toBe(8);
  });

  it("filters file lists", () => {
    const { allowed, blocked } = filterGgufFileNames(
      ["tiny-3b-q4.gguf", "huge-70b-q4.gguf"],
      "org/models",
      { maxParamB: 8 },
      { "tiny-3b-q4.gguf": 2e9, "huge-70b-q4.gguf": 40e9 }
    );
    expect(allowed.length).toBe(1);
    expect(blocked.length).toBe(1);
  });
});
