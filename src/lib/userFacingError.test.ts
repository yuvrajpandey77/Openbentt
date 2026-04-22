import { describe, it, expect } from "vitest";
import { expandNumericRuntimeMessage, formatUserFacingError } from "./userFacingError";

describe("expandNumericRuntimeMessage", () => {
  it("expands long numeric-only ORT-style messages", () => {
    const out = expandNumericRuntimeMessage("9490152");
    expect(out).toContain("9490152");
    expect(out).toContain("ONNX Runtime Web");
  });

  it("leaves short digit strings unchanged", () => {
    expect(expandNumericRuntimeMessage("404")).toBe("404");
  });

  it("leaves normal text unchanged", () => {
    expect(expandNumericRuntimeMessage("no available backend")).toBe("no available backend");
  });
});

describe("formatUserFacingError", () => {
  it("formats Error with numeric message", () => {
    const out = formatUserFacingError(new Error("9490152"), "fallback");
    expect(out).toContain("9490152");
    expect(out).not.toBe("9490152");
  });

  it("uses fallback for empty Error message", () => {
    expect(formatUserFacingError(new Error(""), "fb")).toBe("fb");
  });
});
