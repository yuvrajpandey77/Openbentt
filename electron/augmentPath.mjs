/**
 * GUI-launched Electron often inherits a minimal PATH (no ~/.local/bin, mise, etc.).
 * Prepend common user tool dirs so OpenCode / Claude / Codex detection works.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function existingDirs(candidates) {
  const out = [];
  for (const dir of candidates) {
    try {
      if (dir && fs.existsSync(dir) && fs.statSync(dir).isDirectory()) out.push(dir);
    } catch {
      /* ignore */
    }
  }
  return out;
}

/** @returns {string[]} dirs prepended (for tests / logging) */
export function augmentProcessPath() {
  const home = os.homedir();
  const extras = existingDirs([
    path.join(home, ".opencode", "bin"),
    path.join(home, ".local", "bin"),
    path.join(home, ".claude", "bin"),
    path.join(home, ".codex", "bin"),
    path.join(home, ".cursor", "bin"),
    path.join(home, ".local", "share", "mise", "shims"),
    path.join(home, ".local", "share", "mise", "command-wrappers", "bin"),
    path.join(home, ".asdf", "shims"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
  ]);

  // Cursor Agent install layout: ~/.local/share/mise/installs/cursor-agent/latest/bin
  try {
    const cursorLatest = path.join(home, ".local", "share", "mise", "installs", "cursor-agent", "latest", "bin");
    if (fs.existsSync(cursorLatest)) extras.push(cursorLatest);
  } catch {
    /* ignore */
  }

  const current = (process.env.PATH || "").split(path.delimiter).filter(Boolean);
  const seen = new Set(current);
  const prepend = [];
  for (const dir of extras) {
    if (seen.has(dir)) continue;
    seen.add(dir);
    prepend.push(dir);
  }
  if (prepend.length) {
    process.env.PATH = [...prepend, ...current].join(path.delimiter);
  }
  return prepend;
}
