#!/usr/bin/env node
/**
 * Verify template packs: JSON valid, documentclass present, pack file exists.
 * Optional: run with VERIFY_TEX=1 and pdflatex on PATH to compile WASM-safe packs.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const catalogPath = path.join(root, "public/templates/catalog.json");
const packsDir = path.join(root, "public/templates/packs");
const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
const packs = new Set(catalog.templates.map((t) => t.pack));
let errors = 0;

for (const packFile of packs) {
  const fp = path.join(packsDir, packFile);
  if (!fs.existsSync(fp)) {
    console.error(`Missing pack: ${packFile}`);
    errors++;
    continue;
  }
  const pack = JSON.parse(fs.readFileSync(fp, "utf8"));
  if (!pack.draftTex?.includes("\\documentclass")) {
    console.error(`${packFile}: missing \\documentclass`);
    errors++;
  }
  if (pack.bibliography?.trim() && !pack.draftTex.includes("\\bibliography{")) {
    console.warn(`${packFile}: has bibliography but main tex may not use \\bibliography{}`);
  }
}

const verifyTex = process.env.VERIFY_TEX === "1";
if (verifyTex) {
  const pdflatex = spawnSync("pdflatex", ["--version"], { encoding: "utf8" });
  if (pdflatex.status !== 0) {
    console.error("VERIFY_TEX=1 but pdflatex not found");
    process.exit(1);
  }
  for (const packFile of ["minimal-article.json", "research-article.json"]) {
    const pack = JSON.parse(fs.readFileSync(path.join(packsDir, packFile), "utf8"));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tpl-"));
    fs.writeFileSync(path.join(dir, "main.tex"), pack.draftTex);
    if (pack.bibliography?.trim()) {
      fs.writeFileSync(path.join(dir, "references.bib"), pack.bibliography);
    }
    const r = spawnSync("pdflatex", ["-interaction=nonstopmode", "main.tex"], { cwd: dir, encoding: "utf8" });
    if (pack.bibliography?.trim()) {
      spawnSync("bibtex", ["main"], { cwd: dir });
      spawnSync("pdflatex", ["-interaction=nonstopmode", "main.tex"], { cwd: dir });
      spawnSync("pdflatex", ["-interaction=nonstopmode", "main.tex"], { cwd: dir });
    }
    const pdf = path.join(dir, "main.pdf");
    if (!fs.existsSync(pdf)) {
      console.error(`Compile failed: ${packFile}`);
      errors++;
    } else {
      console.log(`Compiled OK: ${packFile}`);
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

if (errors) {
  console.error(`${errors} error(s)`);
  process.exit(1);
}
console.log(`Verified ${packs.size} template packs.`);
