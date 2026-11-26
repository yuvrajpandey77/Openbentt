/**
 * Detect broken or missing GPU stacks (common on Linux VMs, headless, or GPU-disabled laptops).
 * When enabled, Chromium runs software-rendered so the window opens reliably.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

/** @typedef {{ enabled: boolean, reason: string | null }} GpuSafeModeDecision */

export const GPU_SAFE_MODE_MARKER = "gpu-safe-mode";

/**
 * Persist after a one-shot GPU recovery relaunch so the next cold start stays in software mode.
 * @param {string} userDataDir
 */
export function writeGpuSafeModeMarker(userDataDir) {
  if (!userDataDir || typeof userDataDir !== "string") return;
  const file = path.join(userDataDir, GPU_SAFE_MODE_MARKER);
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.writeFileSync(file, `${new Date().toISOString()}\n`, "utf8");
}

/**
 * @param {string} [userDataDir]
 * @returns {boolean}
 */
export function hasGpuSafeModeMarker(userDataDir) {
  const candidates = [];
  if (userDataDir) candidates.push(path.join(userDataDir, GPU_SAFE_MODE_MARKER));
  // Before app.ready, fall back to the usual Electron userData layout.
  candidates.push(
    path.join(os.homedir(), ".config", "Openbentt", GPU_SAFE_MODE_MARKER),
    path.join(os.homedir(), ".config", "openbentt", GPU_SAFE_MODE_MARKER)
  );
  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}

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

  if (hasGpuSafeModeMarker()) {
    return { enabled: true, reason: "persisted-gpu-safe-mode" };
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
    /** NVIDIA present but proprietary stack not loaded (`driver (null)` in Mesa logs). */
    if (linuxHasNvidiaGpu() && !linuxNvidiaDriverLoaded()) {
      return { enabled: true, reason: "nvidia-no-driver" };
    }
    /**
     * NVIDIA + Wayland: GBM often fails (`nv_gbm_create_device failed`, `driver (null)`).
     * Software + native Wayland avoids invisible windows.
     */
    if (linuxIsWaylandSession() && linuxHasNvidiaGpu()) {
      return { enabled: true, reason: "nvidia-on-wayland" };
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

export function linuxIsWaylandSession() {
  return process.env.XDG_SESSION_TYPE === "wayland" || Boolean(process.env.WAYLAND_DISPLAY);
}

/**
 * Returns true when an NVIDIA GPU is present — regardless of which driver is
 * loaded. The proprietary driver exposes /proc/driver/nvidia/version; nouveau
 * and no-driver setups don't, but the PCI vendor 0x10de is always visible via
 * /sys/bus/pci/devices. Both paths must be checked to cover all Linux configs.
 */
/** True when the proprietary NVIDIA kernel driver is loaded. */
export function linuxNvidiaDriverLoaded() {
  try {
    return fs.existsSync("/proc/driver/nvidia/version") || fs.existsSync("/dev/nvidia0");
  } catch {
    return false;
  }
}

export function linuxHasNvidiaGpu() {
  try {
    if (linuxNvidiaDriverLoaded()) {
      return true;
    }
  } catch {}
  // PCI vendor scan — works with nouveau, no driver, or any other setup.
  try {
    const pciDevs = "/sys/bus/pci/devices";
    if (fs.existsSync(pciDevs)) {
      for (const dir of fs.readdirSync(pciDevs)) {
        try {
          const vendor = fs.readFileSync(`${pciDevs}/${dir}/vendor`, "utf8").trim();
          if (vendor === "0x10de") return true;
        } catch {}
      }
    }
  } catch {}
  return false;
}

/** @deprecated Use linuxHasNvidiaGpu — kept for any external callers. */
export function linuxHasNvidiaDriver() {
  return linuxHasNvidiaGpu();
}

/** @type {GpuSafeModeDecision | null} */
let cached = null;

/** @returns {GpuSafeModeDecision} */
export function getGpuSafeMode() {
  if (!cached) cached = resolveGpuSafeMode();
  return cached;
}