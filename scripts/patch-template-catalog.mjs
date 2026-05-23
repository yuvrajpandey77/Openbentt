#!/usr/bin/env node
/** Mark one featured+verified entry per pack in catalog.json */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const catalogPath = path.join(root, "public/templates/catalog.json");
const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
const seen = new Set();

for (const t of catalog.templates) {
  t.verified = true;
  if (!seen.has(t.pack)) {
    t.featured = true;
    seen.add(t.pack);
  } else {
    t.featured = false;
  }
}

fs.writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`Patched ${catalog.templates.length} entries, ${seen.size} featured packs.`);
