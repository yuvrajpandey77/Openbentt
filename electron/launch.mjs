/**
 * Spawn Electron with GPU flags applied before the binary starts (avoids early NVIDIA GBM probes).
 */
import { spawn } from "node:child_process";
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
}

electronArgs.push(".");

const child = spawn(electron, electronArgs, {
  cwd: appRoot,
  stdio: "inherit",
  env,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
