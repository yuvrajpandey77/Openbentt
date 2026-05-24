/**
 * Smoke test: launch Electron with GPU disabled, wait 12s, then kill.
 * Exits 0 if Electron stayed alive for the full window (i.e. didn't crash at startup).
 * Exits 1 if Electron died before the window closed.
 *
 * Usage (called by `npm run electron:test:safe`):
 *   cross-env OPENBENTT_DISABLE_GPU=1 OPENBENTT_SMOKE_TEST=1 node electron/smokeTest.mjs
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import electron from "electron";
import { resolveGpuSafeMode } from "./gpuSafeMode.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");

const SMOKE_WINDOW_MS = 12_000;

const decision = resolveGpuSafeMode();
const electronArgs = ["--disable-gpu", "--disable-gpu-compositing"];
const env = { ...process.env, LIBGL_ALWAYS_SOFTWARE: "1" };

if (decision.enabled && !electronArgs.includes("--disable-gpu")) {
  electronArgs.push("--disable-gpu", "--disable-gpu-compositing");
}

electronArgs.push(".");

console.log("[smoke] Launching Electron (no-GPU mode)…");
const child = spawn(electron, electronArgs, {
  cwd: appRoot,
  stdio: ["ignore", "inherit", "inherit"],
  env,
});

let crashed = false;

child.on("exit", (code, signal) => {
  if (crashed) return;
  crashed = true;
  if (signal === "SIGTERM" || signal === "SIGKILL") {
    // Killed by us — that's expected.
    return;
  }
  console.error(`[smoke] Electron exited early with code=${code} signal=${signal}`);
  process.exit(1);
});

setTimeout(() => {
  if (crashed) return;
  console.log("[smoke] Electron stayed alive for the full smoke window — PASS.");
  child.kill("SIGTERM");
  process.exit(0);
}, SMOKE_WINDOW_MS);
