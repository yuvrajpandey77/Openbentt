/**
 * Real execution for approval-gated RUN_COMMANDS steps.
 *
 * The harness simulator never spawns shells. When the user approves a
 * command through the actionStore bridge, THIS module carries it out for
 * real — but only for an explicit argv allowlist, inside the validated
 * workspace, with timeouts + bounded output. Anything else completes as
 * inspection-only (honest, never faked).
 */
import { execFile } from "node:child_process";
import { createLogger } from "./log.mjs";

const log = createLogger("approvedExec");

const EXEC_TIMEOUT_MS = 300000;
const MAX_OUTPUT_CHARS = 20000;

/** Allowed argv shapes (exact binary + subcommand match, no shell). */
const ALLOWLIST = [
  { bin: ["npm"], args: [["test"], ["run", "build"], ["run", "test"]] },
  { bin: ["npx"], args: [["vitest", "run"]] },
  { bin: ["pytest"], args: [[]] },
  { bin: ["python3", "python"], args: [["-m", "pytest"]] },
  { bin: ["cargo"], args: [["test"]] },
  { bin: ["go"], args: [["test", "./..."], ["test"]] },
  { bin: ["latexmk"], args: [[], ["-pdf"]] },
  { bin: ["pdflatex"], args: [[]] },
  { bin: ["bibtex"], args: [[]] },
  { bin: ["xelatex", "lualatex"], args: [[]] },
];

const SHELL_META = /[;&|$`><\\'"\n\r]/;

function parseArgv(command) {
  const clean = String(command ?? "").trim().slice(0, 500);
  if (!clean || SHELL_META.test(clean)) return null;
  const parts = clean.split(/\s+/);
  if (parts.length > 12) return null;
  return parts;
}

export function isCommandAllowed(command) {
  const parts = parseArgv(command);
  if (!parts) return false;
  const [bin, ...rest] = parts;
  // LaTeX binaries accept a single .tex operand; others take none/flags.
  const texBins = new Set(["latexmk", "pdflatex", "xelatex", "lualatex", "bibtex"]);
  for (const entry of ALLOWLIST) {
    if (!entry.bin.includes(bin)) continue;
    for (const shape of entry.args) {
      if (shape.length === 0) {
        if (rest.length === 0) return true;
        // Single operand: .tex file (compilers) or bare basename (bibtex).
        if (rest.length === 1 && /^[\w][\w./-]*$/.test(rest[0] ?? "") && !rest[0].startsWith("-")) {
          if (bin === "bibtex") return true;
          if (texBins.has(bin) && /\.tex$/.test(rest[0])) return true;
        }
        continue;
      }
      if (rest.length < shape.length) continue;
      if (shape.every((s, i) => rest[i] === s)) {
        const extra = rest.slice(shape.length);
        // Only a single path-like operand (bibtex basename, .tex file,
        // test path) — never flags (no leading dash).
        if (extra.length === 0) return true;
        if (extra.length === 1 && /^[\w][\w./-]*$/.test(extra[0] ?? "") && !extra[0].startsWith("-")) return true;
      }
    }
  }
  return false;
}

export async function executeApprovedCommand({ command, cwd, workspaceRoot, env }) {
  if (!isCommandAllowed(command)) throw new Error("Command not in allowlist");
  const parts = parseArgv(command);
  if (!parts) throw new Error("Unparseable command");
  const [bin, ...args] = parts;
  const startedAt = Date.now();
  const result = await new Promise((resolve) => {
    const child = execFile(bin, args, {
      cwd,
      timeout: EXEC_TIMEOUT_MS,
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
      env: env ?? { ...process.env },
    }, (err, stdout, stderr) => {
      const out = `${stdout ?? ""}\n${stderr ?? ""}`.slice(0, MAX_OUTPUT_CHARS * 2);
      if (err && err.killed) {
        resolve({ code: null, output: out.slice(0, MAX_OUTPUT_CHARS), timedOut: true });
        return;
      }
      resolve({ code: err ? (err.code ?? 1) : 0, output: out.slice(0, MAX_OUTPUT_CHARS), timedOut: false });
    });
    void child;
  });
  const durationMs = Date.now() - startedAt;
  log.info("approved command finished", { command: parts[0], code: result.code, durationMs });
  void workspaceRoot;
  return { ...result, durationMs, command: parts.join(" ") };
}
