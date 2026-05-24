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

  it("enables safe mode on Linux Wayland + NVIDIA unless forced off", async () => {
    if (process.platform !== "linux") return;
    const { linuxHasNvidiaGpu, linuxIsWaylandSession, resolveGpuSafeMode } = await import(
      "./gpuSafeMode.mjs"
    );
    if (!linuxHasNvidiaGpu() || !linuxIsWaylandSession()) return;

    delete process.env.OPENBENTT_DISABLE_GPU;
    const decision = resolveGpuSafeMode();
    assert.equal(decision.enabled, true);
    assert.ok(
      decision.reason === "nvidia-on-wayland" || decision.reason === "nvidia-no-driver",
      `unexpected reason: ${decision.reason}`
    );

    process.env.OPENBENTT_DISABLE_GPU = "0";
    assert.equal(resolveGpuSafeMode().enabled, false);
    delete process.env.OPENBENTT_DISABLE_GPU;
  });
});
