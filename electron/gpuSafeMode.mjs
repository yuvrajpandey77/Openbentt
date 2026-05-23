/**
 * Detect broken or missing GPU stacks (common on Linux VMs, headless, or GPU-disabled laptops).
 * When enabled, Chromium runs software-rendered so the window opens reliably.
 */
import fs from "node:fs";

/** @typedef {{ enabled: boolean, reason: string | null }} GpuSafeModeDecision */

/**
 * @returns {GpuSafeModeDecision}
 */
export function resolveGpuSafeMode() {
  const forceOff = process.env.OPENBENTT_DISABLE_GPU === "1";
  const forceOn = process.env.OPENBENTT_DISABLE_GPU === "0";

  if (forceOff) {
    return { enabled: true, reason: "OPENBENTT_DISABLE_GPU=1" };
  }
  if (forceOn) {
    return { enabled: false, reason: null };
  }

  if (process.platform === "linux") {
    if (process.env.LIBGL_ALWAYS_SOFTWARE === "1") {
      return { enabled: true, reason: "LIBGL_ALWAYS_SOFTWARE=1" };
    }
    if (process.env.GALLIUM_DRIVER === "llvmpipe" || process.env.MESA_LOADER_DRIVER_OVERRIDE === "swrast") {
      return { enabled: true, reason: "software-gl-driver" };
    }
    if (!linuxHasGpuDevice()) {
      return { enabled: true, reason: "no-dri-device" };
    }
  }

  return { enabled: false, reason: null };
}

function linuxHasGpuDevice() {
  try {
    const dri = "/dev/dri";
    if (!fs.existsSync(dri)) return false;
    const entries = fs.readdirSync(dri);
    return entries.some((name) => name.startsWith("card") || name.startsWith("renderD"));
  } catch {
    return false;
  }
}

/** @type {GpuSafeModeDecision | null} */
let cached = null;

/** @returns {GpuSafeModeDecision} */
export function getGpuSafeMode() {
  if (!cached) cached = resolveGpuSafeMode();
  return cached;
}
