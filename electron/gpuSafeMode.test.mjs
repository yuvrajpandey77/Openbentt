import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("gpuSafeMode", () => {
  it("returns disabled by default on non-Linux platforms", async () => {
    const { resolveGpuSafeMode } = await import("./gpuSafeMode.mjs");
    const decision = resolveGpuSafeMode();
    // On non-Linux, should be disabled
    if (process.platform !== "linux") {
      assert.equal(decision.enabled, false);
    }
  });

  it("respects OPENBENTT_DISABLE_GPU=1 force flag", async () => {
    process.env.OPENBENTT_DISABLE_GPU = "1";
    const { resolveGpuSafeMode } = await import("./gpuSafeMode.mjs");
    const decision = resolveGpuSafeMode();
    assert.equal(decision.enabled, true);
    assert.equal(decision.reason, "OPENBENTT_DISABLE_GPU=1");
    delete process.env.OPENBENTT_DISABLE_GPU;
  });

  it("respects OPENBENTT_DISABLE_GPU=0 force flag", async () => {
    process.env.OPENBENTT_DISABLE_GPU = "0";
    const { resolveGpuSafeMode } = await import("./gpuSafeMode.mjs");
    const decision = resolveGpuSafeMode();
    assert.equal(decision.enabled, false);
    assert.equal(decision.reason, null);
    delete process.env.OPENBENTT_DISABLE_GPU;
  });

  it("detects LIBGL_ALWAYS_SOFTWARE=1", async () => {
    process.env.LIBGL_ALWAYS_SOFTWARE = "1";
    const { resolveGpuSafeMode } = await import("./gpuSafeMode.mjs");
    const decision = resolveGpuSafeMode();
    if (process.platform === "linux") {
      assert.equal(decision.enabled, true);
      assert.equal(decision.reason, "LIBGL_ALWAYS_SOFTWARE=1");
    }
    delete process.env.LIBGL_ALWAYS_SOFTWARE;
  });

  it("linuxIsWaylandSession detects Wayland", async () => {
    process.env.XDG_SESSION_TYPE = "wayland";
    const { linuxIsWaylandSession } = await import("./gpuSafeMode.mjs");
    assert.equal(linuxIsWaylandSession(), true);
    delete process.env.XDG_SESSION_TYPE;

    process.env.WAYLAND_DISPLAY = "wayland-0";
    assert.equal(linuxIsWaylandSession(), true);
    delete process.env.WAYLAND_DISPLAY;

    process.env.XDG_SESSION_TYPE = "x11";
    assert.equal(linuxIsWaylandSession(), false);
    delete process.env.XDG_SESSION_TYPE;
  });
});