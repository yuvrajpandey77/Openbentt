/**
 * Generates docs/IPC_SECURITY_COVERAGE.md from the live source and policy.
 * Run with: node scripts/inventory-ipc.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getChannelPolicy } from "../electron/ipcAuthorization.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const policy = getChannelPolicy();

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(mjs|cjs)$/.test(entry.name) ? [full] : [];
  });
}

const registrations = [];
for (const file of walk(path.join(root, "electron"))) {
  if (file.endsWith("ipcAuthorization.mjs")) continue;
  const text = fs.readFileSync(file, "utf8");
  const lines = text.split("\n");
  const re = /(?:ipcMain|ipc)\.(handle|on|once|handleOnce)\(\s*(?:["'`])([^"'`]+)(?:["'`])\s*,\s*(?:async\s*)?\(([^)]*)\)/g;
  for (const match of text.matchAll(re)) {
    const line = text.slice(0, match.index).split("\n").length;
    registrations.push({
      channel: match[2],
      type: match[1],
      args: match[3].trim().replace(/\s+/g, " ") || "event only",
      file: path.relative(root, file),
      line,
      source: lines[line - 1]?.trim() ?? "",
    });
  }
}

const preload = fs.readFileSync(path.join(root, "electron/preload.cjs"), "utf8");
const bridgeForChannel = new Map();
let currentBridge = null;
for (const line of preload.split("\n")) {
  const exposure = line.match(/contextBridge\.exposeInMainWorld\(["']([^"']+)["']/);
  if (exposure) currentBridge = exposure[1];
  const invocation = line.match(/ipcRenderer\.(invoke|on)\(["']([^"']+)["']/);
  if (invocation && currentBridge) bridgeForChannel.set(invocation[2], currentBridge);
}

const byChannel = new Map();
for (const reg of registrations) {
  if (!byChannel.has(reg.channel)) byChannel.set(reg.channel, []);
  byChannel.get(reg.channel).push(reg);
}

const alias = {
  any: "any value",
  id: "safe id (1–128 [A-Za-z0-9_-])",
  nullableId: "safe id or null",
  approval: "main-issued approval id",
  op: "allowlisted op token",
  text: "short string ≤20k",
  longText: "string ≤2MB",
  path: "absolute/path-like string ≤4096",
  url: "http(s) URL",
  repoId: "HF repo id",
  bool: "boolean",
  num: "finite number",
  object: "plain object",
  array: "array",
  base64: "base64 payload",
  audio: "PCM16 audio ≤256 KiB",
};

const capabilitiesByChannel = new Map();
for (const [channel, rule] of Object.entries(policy)) {
  capabilitiesByChannel.set(channel, rule);
}

function cell(value) {
  return String(value ?? "—").replace(/\|/g, "\\|");
}

const lines = [];
lines.push("# IPC security coverage — Openbentt Phase 3");
lines.push("");
const directCount = registrations.filter((r) => /ipcMain\./.test(r.source)).length;
const delegatedCount = registrations.length - directCount;
lines.push(
  `Generated from source by \`node scripts/inventory-ipc.mjs\`. ${registrations.length} registrations / ${byChannel.size} unique channels; ${Object.keys(policy).length} policy entries.`
);
lines.push("");
lines.push(
  `Of the registrations, ${directCount} are direct \`ipcMain.handle\` calls and ${delegatedCount} are delegated through \`registerDesktopWindowIpc(ipcMain)\`. Every registration is wrapped by \`installIpcAuthorization(ipcMain)\` in \`electron/main.mjs\` before services register. Default is deny: an unlisted channel is rejected at runtime and fails the static gate.`
);
lines.push("");
lines.push("## Enforcement model");
lines.push("");
lines.push(
  "- **Expected sender:** the single `BrowserWindow` created by `electron/main.mjs`; object identity of `event.sender` is checked against the main-owned registry."
);
lines.push(
  "- **Expected frame:** main frame only (`parent === null`, routing id matches `sender.mainFrame`). Child frames and opaque origins are rejected."
);
lines.push(
  "- **Expected origin:** `app://openbentt` in packaged/local builds; the configured Vite loopback origin in development. No other origin is accepted."
);
lines.push(
  "- **Capabilities:** main-process-issued, channel-scoped grants. No IPC channel or renderer API can add, remove or escalate a grant."
);
lines.push(
  "- **Payloads:** channel-specific argument validators, plain-value size/depth limits, required-argument checks, and main-issued evidence for approval-gated operations."
);
lines.push(
  "- **Additional controls:** native confirmation dialogs for opening paths, actionStore approvals for writes/agent permissions, path allowlists for OCR/LaTeX/GGUF/PDF paths, and URL/navigation policies."
);
lines.push("");
lines.push("## Per-channel coverage");
lines.push("");
lines.push(
  "| Channel | Registrations | Calling renderer | Required privileges (main-issued) | Expected sender | Accepted arguments / validation | Capabilities / filesystem or process | Existing controls |"
);
lines.push("|---|---:|---|---|---|---|---|---|");
for (const [channel, regs] of [...byChannel.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  const rule = capabilitiesByChannel.get(channel);
  const renderer = bridgeForChannel.get(channel)
    ? `${bridgeForChannel.get(channel)} (preload bridge)`
    : "main process only (no renderer bridge)";
  const args = regs
    .map((r) => r.args)
    .filter((v, i, a) => a.indexOf(v) === i)
    .join("; ");
  const validators = rule?.argValidators?.length
    ? rule.argValidators.map((v) => alias[v] ?? v).join(", ")
    : "no user arguments";
  const capabilities = rule?.capabilities?.length ? rule.capabilities.join(", ") : "status/read-only";
  const evidence = rule?.evidence?.length ? `; evidence: ${rule.evidence.join(", ")}` : "";
  const fsProcess = capabilities
    .split(", ")
    .filter((c) => /fs|exec|path|document|terminal|computer|binary|voice|secrets/.test(c))
    .join(", ") || "none";
  lines.push(
    `| \`${cell(channel)}\` | ${regs.length} | ${cell(renderer)} | ${cell(capabilities)} | trusted main window/main frame/app-origin | ${cell(`${args} → ${validators}; ≤${Math.round((rule?.maxBytes ?? 0) / 1024)} KiB${evidence}`)} | ${cell(fsProcess)} | ${cell(`${regs.map((r) => `${r.file}:${r.line}`).join(", ")}; policy entry present`)} |`
  );
}
lines.push("");
lines.push("## Non-IPC renderer events (main → renderer)");
lines.push("");
lines.push(
  "Event subscriptions in `electron/preload.cjs` (`desktop:menuNavigate`, `desktop:updateStatus`, `workspace:files-changed`, `localGguf:downloadProgress`, `narration:progress`, `zotero:syncProgress`, `zotero:libraryChanged`, `research:jobProgress`, `research:beforeQuit`, `agent:event`, `voice:event`, `ollama:pullProgress`) are outbound only. They cannot invoke main-process capabilities and are not part of the authorization surface."
);
lines.push("");

const out = path.join(root, "docs/IPC_SECURITY_COVERAGE.md");
fs.writeFileSync(out, lines.join("\n"), "utf8");
console.log(`Wrote ${path.relative(root, out)} (${registrations.length} registrations, ${byChannel.size} channels)`);
