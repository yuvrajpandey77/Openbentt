import { describe, expect, it } from "vitest";
import { estimateMinVramGiBForWeights, guessQuantLabelFromGgufFileName } from "./ggufHints";

describe("ggufHints", () => {
  it("detects common quants in filenames", () => {
    expect(guessQuantLabelFromGgufFileName("model-Q4_K_M.gguf")).toBe("Q4");
    expect(guessQuantLabelFromGgufFileName("foo_q8_0.gguf")).toBe("Q8");
    expect(guessQuantLabelFromGgufFileName("bar-f16.gguf")).toBe("F16");
  });

  it("returns null when unknown", () => {
    expect(guessQuantLabelFromGgufFileName("weights.gguf")).toBeNull();
  });

  it("estimates VRAM GiB from size", () => {
    const oneGiB = 1024 ** 3;
    expect(estimateMinVramGiBForWeights(oneGiB)).toBeGreaterThanOrEqual(1);
    expect(estimateMinVramGiBForWeights(4 * oneGiB)).toBeGreaterThanOrEqual(4);
  });
});
