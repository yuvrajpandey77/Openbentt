/**
 * Ensures Electron main/worker imports from src/ are listed in electron-builder `files`.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const filePatterns = pkg.build?.files ?? [];

/** @param {string} rel */
function isCoveredByFiles(rel) {
  const normalized = rel.replace(/\\/g, "/");
  for (const pattern of filePatterns) {
    if (typeof pattern !== "string") continue;
    if (pattern.startsWith("!")) continue;
    const p = pattern.replace(/\\/g, "/").replace(/\*\*\//g, "").replace(/\*/g, "");
    if (normalized === pattern.replace(/\*\*/g, "").replace(/\*/g, "")) return true;
    if (pattern.includes("**") && normalized.startsWith(pattern.split("**")[0])) return true;
    if (pattern.endsWith("/**/*.mjs") && normalized.startsWith(pattern.slice(0, -"/**/*.mjs".length))) {
      return true;
    }
    if (pattern.endsWith("/**/*") && normalized.startsWith(pattern.slice(0, -"/**/*".length))) {
      return true;
    }
    if (normalized.startsWith(p.replace(/\/$/, ""))) return true;
  }
  return false;
}

const required = [
  "src/lib/zotero/zoteroMapper.mjs",
  "src/lib/research/corpusChunksCore.mjs",
  "src/lib/research/embedCore.mjs",
];

const missing = required.filter((rel) => !isCoveredByFiles(rel));
if (missing.length) {
  console.error("Electron pack manifest check failed — add to package.json build.files:");
  for (const m of missing) console.error(`  • ${m}`);
  process.exit(1);
}

console.log("Electron pack manifest check passed (main-process src imports covered).");
