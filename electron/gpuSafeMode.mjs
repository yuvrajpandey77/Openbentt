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
    /** NVIDIA present but proprietary stack not loaded (`driver (null)` in Mesa logs). */
    if (linuxHasNvidiaGpu() && !linuxNvidiaDriverLoaded()) {
      return { enabled: true, reason: "nvidia-no-driver" };
    }
    /**
     * NVIDIA + Wayland: GBM often fails (`nv_gbm_create_device failed`, `driver (null)`),
     * and XWayland + software X11 painting yields invisible windows
     * (`XGetWindowAttributes failed for window 1`). Software + native Wayland avoids both.
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
