import { describe, expect, it } from "vitest";
import { assertSafeGgufFileName, assertSafeRepoId, assertRevision } from "./validate";

describe("localGguf validate", () => {
  it("accepts HF repo id", () => {
    expect(assertSafeRepoId("TheBloke/Llama-2-7B-GGUF")).toBe("TheBloke/Llama-2-7B-GGUF");
  });

  it("rejects traversal in file name", () => {
    expect(() => assertSafeGgufFileName("../evil.gguf")).toThrow();
  });

  it("defaults revision", () => {
    expect(assertRevision(undefined)).toBe("main");
  });
});
