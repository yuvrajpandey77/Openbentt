/**
 * Phase 2 — Reproducible document benchmark entry point.
 * Real timings come from `npm run bench:documents` (vitest, measured).
 * This wrapper only verifies fixtures exist (no fabricated numbers).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dir = path.join(root, "test/fixtures/documents");
const files = fs.readdirSync(dir);
console.log(JSON.stringify({ fixtures: files, run: "npm run bench:documents" }, null, 2));
