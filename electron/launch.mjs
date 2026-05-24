/**
 * Spawn Electron with GPU flags applied before the binary starts (avoids early NVIDIA GBM probes).
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import electron from "electron";
import { resolveGpuSafeMode } from "./gpuSafeMode.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");

const decision = resolveGpuSafeMode();
const electronArgs = [];
const env = { ...process.env };

if (decision.enabled) {
  electronArgs.push("--disable-gpu", "--disable-gpu-compositing");
  env.LIBGL_ALWAYS_SOFTWARE = "1";
  if (!process.env.OPENBENTT_OZONE_PLATFORM) {
    const wayland =
      process.env.XDG_SESSION_TYPE === "wayland" || Boolean(process.env.WAYLAND_DISPLAY);
    electronArgs.push(`--ozone-platform=${wayland ? "wayland" : "x11"}`);
  }
  electronArgs.push(
    "--disable-gpu-sandbox",
    "--enable-software-rasterizer",
    "--disable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan,UseSkiaRenderer"
  );
}

const isDev = process.env.OPENBENTT_ELECTRON_DEV === "1";
if (isDev) {
  /** Isolated profile — avoids stale ~/.config/Openbentt cache/DIPS breaking dev loads. */
  const devUserData = path.join(appRoot, ".electron-dev-profile");
  fs.mkdirSync(devUserData, { recursive: true });
  /** Remove stale SingletonLock so a crashed previous run never blocks restart. */
  try { fs.unlinkSync(path.join(devUserData, "SingletonLock")); } catch { /* not present */ }
  electronArgs.push(`--user-data-dir=${devUserData}`, "--disable-http-cache");
}

electronArgs.push(".");

const child = spawn(electron, electronArgs, {
  cwd: appRoot,
  stdio: ["ignore", "inherit", "inherit"],
  env,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
