import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import electron from "electron";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");

const isDev = process.env.OPENBENTT_ELECTRON_DEV === "1";
const electronArgs = [];
const env = { ...process.env };

if (isDev) {
  const devUserData = path.join(appRoot, ".electron-dev-profile");
  fs.mkdirSync(devUserData, { recursive: true });
  try { fs.unlinkSync(path.join(devUserData, "SingletonLock")); } catch { /* not present */ }
  electronArgs.push(`--user-data-dir=${devUserData}`, "--disable-http-cache");
}

electronArgs.push(".");

const child = spawn(electron, electronArgs, {
  cwd: appRoot,
  stdio: ["ignore", "inherit", "inherit"],
  env,
});

child.on("error", (err) => {
  console.error(`[electron] Failed to spawn: ${err.message}`);
  process.exit(1);
});

child.on("close", (code) => {
  if (code !== 0 && !isDev) {
    console.error(`[electron] Process exited with code ${code}`);
    process.exit(code ?? 1);
  }
});

process.on("SIGTERM", () => {
  child.kill("SIGTERM");
  process.exit(0);
});

process.on("SIGINT", () => {
  child.kill("SIGINT");
  process.exit(0);
});
