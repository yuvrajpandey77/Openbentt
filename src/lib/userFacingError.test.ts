import { describe, it, expect } from "vitest";
import {
  expandNumericRuntimeMessage,
  expandRuntimeInferenceMessage,
  expandWasmTrapMessage,
  formatUserFacingError,
} from "./userFacingError";

describe("expandNumericRuntimeMessage", () => {
  it("expands long numeric-only ORT-style messages", () => {
    const out = expandNumericRuntimeMessage("9490152");
    expect(out).toContain("9490152");
    expect(out).toContain("ONNX Runtime Web");
    expect(out).toContain("Device failed at creation");
  });

  it("leaves short digit strings unchanged", () => {
    expect(expandNumericRuntimeMessage("404")).toBe("404");
  });

  it("leaves normal text unchanged", () => {
    expect(expandNumericRuntimeMessage("no available backend")).toBe("no available backend");
  });
});

describe("expandWasmTrapMessage", () => {
  it("expands table index trap with guidance", () => {
    const out = expandWasmTrapMessage("table index is out of bounds");
    expect(out).toContain("table index is out of bounds");
    expect(out).toContain("WebAssembly");
    expect(out).toContain("prompt is too long");
  });

  it("leaves unrelated messages unchanged", () => {
    expect(expandWasmTrapMessage("network failed")).toBe("network failed");
  });

  it("expands unaligned access with GPU/WebGPU hint", () => {
    const out = expandWasmTrapMessage("operation does not support unaligned accesses");
    expect(out).toContain("unaligned accesses");
    expect(out).toContain("WebGPU");
    expect(out).toContain("Vulkan");
  });
});

describe("expandRuntimeInferenceMessage", () => {
  it("applies WASM expansion before numeric expansion", () => {
    const out = expandRuntimeInferenceMessage("  memory access out of bounds  ");
    expect(out).toContain("memory access out of bounds");
    expect(out).toContain("ONNX Runtime Web");
  });

  it("still expands numeric-only ORT codes", () => {
    const out = expandRuntimeInferenceMessage("9490152");
    expect(out).toContain("9490152");
    expect(out).toContain("ONNX Runtime Web");
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

  it("formats WASM trap messages", () => {
    const out = formatUserFacingError(new Error("table index is out of bounds"));
    expect(out).toContain("table index is out of bounds");
    expect(out).toContain("WebAssembly");
  });

  it("formats unaligned-access WASM messages", () => {
    const out = formatUserFacingError(new Error("operation does not support unaligned accesses"));
    expect(out).toContain("unaligned");
    expect(out).toContain("WebAssembly");
  });
});
