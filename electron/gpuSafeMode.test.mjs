import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("gpuSafeMode", () => {
  it("always returns disabled — GPU is never a blocker", async () => {
    const { resolveGpuSafeMode } = await import("./gpuSafeMode.mjs");
    const decision = resolveGpuSafeMode();
    assert.equal(decision.enabled, false);
  });
});
