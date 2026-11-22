/**
 * Auto-detect installed coding/agent CLIs so Openbentt can route work
 * beyond OpenCode (Claude Code, Codex, Cursor Agent, Aider, Gemini CLI, …).
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   available: boolean,
 *   path: string | null,
 *   version: string | null,
 *   kind: "agent" | "assistant",
 * }} DetectedAgent
 */

const CANDIDATES = [
  {
    id: "opencode",
    name: "OpenCode",
    kind: "agent",
    bins: ["opencode"],
    extra: (home) => [
      path.join(home, ".local", "bin", "opencode"),
      path.join(home, ".opencode", "bin", "opencode"),
      "/usr/local/bin/opencode",
      "/opt/homebrew/bin/opencode",
    ],
  },
  {
    id: "claude",
    name: "Claude Code",
    kind: "agent",
    bins: ["claude"],
    extra: (home) => [
      path.join(home, ".local", "bin", "claude"),
      path.join(home, ".claude", "bin", "claude"),
      "/usr/local/bin/claude",
      "/opt/homebrew/bin/claude",
    ],
  },
  {
    id: "codex",
    name: "OpenAI Codex CLI",
    kind: "agent",
    bins: ["codex"],
    extra: (home) => [
      path.join(home, ".local", "bin", "codex"),
      path.join(home, ".codex", "bin", "codex"),
      "/usr/local/bin/codex",
      "/opt/homebrew/bin/codex",
    ],
  },
  {
    id: "cursor-agent",
    name: "Cursor Agent",
    kind: "agent",
    bins: ["cursor-agent", "cursor"],
    extra: (home) => [
      path.join(home, ".local", "bin", "cursor-agent"),
      path.join(home, ".cursor", "bin", "cursor-agent"),
      "/usr/local/bin/cursor",
      "/opt/homebrew/bin/cursor",
    ],
  },
  {
    id: "aider",
    name: "Aider",
    kind: "agent",
    bins: ["aider"],
    extra: (home) => [
      path.join(home, ".local", "bin", "aider"),
      path.join(home, ".aider", "bin", "aider"),
      "/usr/local/bin/aider",
      "/opt/homebrew/bin/aider",
    ],
  },
  {
    id: "gemini",
    name: "Gemini CLI",
    kind: "assistant",
    bins: ["gemini"],
    extra: (home) => [
      path.join(home, ".local", "bin", "gemini"),
      "/usr/local/bin/gemini",
      "/opt/homebrew/bin/gemini",
    ],
  },
];

function whichSync(bin) {
  const pathEnv = process.env.PATH || "";
  const exts = process.platform === "win32" ? [".exe", ".cmd", ".bat", ""] : [""];
  for (const dir of pathEnv.split(path.delimiter)) {
    for (const ext of exts) {
      const full = path.join(dir, bin + ext);
      try {
        if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
      } catch {
        /* ignore */
      }
    }
  }
  return null;
}

function readVersion(executablePath, timeoutMs = 4000) {
  return new Promise((resolve) => {
    try {
      const child = spawn(executablePath, ["--version"], {
        stdio: ["ignore", "pipe", "pipe"],
        env: process.env,
      });
      let out = "";
      const t = setTimeout(() => {
        try {
          child.kill();
        } catch {
          /* ignore */
        }
        resolve(out.trim().slice(0, 120) || null);
      }, timeoutMs);
      child.stdout?.on("data", (d) => {
        out += String(d);
      });
      child.stderr?.on("data", (d) => {
        out += String(d);
      });
      child.on("close", () => {
        clearTimeout(t);
        const line = out
          .split(/\r?\n/)
          .map((l) => l.trim())
          .find(Boolean);
        resolve(line ? line.slice(0, 120) : null);
      });
      child.on("error", () => {
        clearTimeout(t);
        resolve(null);
      });
    } catch {
      resolve(null);
    }
  });
}

/**
 * @returns {Promise<DetectedAgent[]>}
 */
export async function detectExternalAgents() {
  const home = os.homedir();
  /** @type {DetectedAgent[]} */
  const out = [];

  for (const c of CANDIDATES) {
    const search = [...(c.extra?.(home) ?? []), ...c.bins];
    let found = null;
    for (const cand of search) {
      if (cand.includes(path.sep) || cand.includes("/")) {
        try {
          if (fs.existsSync(cand) && fs.statSync(cand).isFile()) {
            found = cand;
            break;
          }
        } catch {
          /* ignore */
        }
      } else {
        const w = whichSync(cand);
        if (w) {
          found = w;
          break;
        }
      }
    }
    let version = null;
    if (found) {
      version = await readVersion(found);
    }
    // mise/asdf shims often exist on PATH before a real tool is installed.
    const shimNoise =
      version &&
      (/mise ERROR/i.test(version) ||
        /No version is set for shim/i.test(version) ||
        /installing \d+ tool/i.test(version) ||
        /command not found/i.test(version));
    const available = Boolean(found) && !shimNoise;
    out.push({
      id: c.id,
      name: c.name,
      available,
      path: available ? found : found && shimNoise ? null : found,
      version: available ? version : shimNoise ? null : version,
      kind: c.kind,
    });
  }

  return out;
}

/**
 * @param {import("electron").IpcMain} ipcMain
 */
export function registerExternalAgentDetectIpc(ipcMain) {
  ipcMain.handle("agents:detect", async () => {
    try {
      const agents = await detectExternalAgents();
      return { ok: true, agents };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e), agents: [] };
    }
  });
}
