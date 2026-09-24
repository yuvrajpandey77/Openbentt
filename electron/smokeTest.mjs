/**
 * Smoke test: launch Electron, wait 12s, then kill.
 * Exits 0 if Electron stayed alive for the full window.
 * Exits 1 if Electron died before the window closed.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import electron from "electron";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");

const SMOKE_WINDOW_MS = 12_000;
const electronArgs = ["."];
const env = { ...process.env };

console.log("[smoke] Launching Electron…");
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
    return;
  }
  console.error(`[smoke] Electron exited early with code=${code} signal=${signal}`);
  process.exit(1);
});

setTimeout(() => {
  if (crashed) return;
  console.log("[smoke] Electron stayed alive — PASS.");
  child.kill("SIGTERM");
  process.exit(0);
}, SMOKE_WINDOW_MS);
