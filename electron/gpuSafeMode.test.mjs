import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("gpuSafeMode", () => {
  it("respects OPENBENTT_DISABLE_GPU=1", async () => {
    process.env.OPENBENTT_DISABLE_GPU = "1";
    const { resolveGpuSafeMode } = await import("./gpuSafeMode.mjs");
    assert.equal(resolveGpuSafeMode().enabled, true);
    delete process.env.OPENBENTT_DISABLE_GPU;
  });

  it("respects OPENBENTT_DISABLE_GPU=0", async () => {
    process.env.OPENBENTT_DISABLE_GPU = "0";
    const { resolveGpuSafeMode } = await import("./gpuSafeMode.mjs");
    assert.equal(resolveGpuSafeMode().enabled, false);
    delete process.env.OPENBENTT_DISABLE_GPU;
  });
});
