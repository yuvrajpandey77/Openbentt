/**
 * Phase 1 security gate: verifies the canonical CSP (scripts/csp-policy.mjs) is
 * present and identical in every production artifact.
 *
 * - dist/index.html must contain the exact <meta http-equiv> tag (covers the web
 *   build AND the Electron packaged app, which loads the same dist/ via app://).
 * - docker/nginx-docker.conf must serve the identical policy as an HTTP header
 *   (plus nothing weaker — the header is compared after whitespace normalization).
 *
 * Run via `npm run test:csp` (also wired to `postbuild`, so `npm run build`
 * fails if the CSP is accidentally removed or drifts).
 *
 * Usage: node scripts/check-csp-artifacts.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CSP_POLICY, buildCspMetaTag } from "./csp-policy.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const failures = [];

function normalize(s) {
  return s.replace(/\s+/g, " ").trim();
}

// 1. dist/index.html — exact meta tag (Electron loads this same file via app://).
const indexHtml = path.join(ROOT, "dist", "index.html");
if (!fs.existsSync(indexHtml)) {
  failures.push(`missing ${indexHtml} — run \`npm run build\` first`);
} else {
  const html = fs.readFileSync(indexHtml, "utf8");
  const expected = buildCspMetaTag();
  if (!html.includes(expected)) {
    const hasAnyCsp = html.includes('http-equiv="Content-Security-Policy"');
    failures.push(
      hasAnyCsp
        ? "dist/index.html contains a CSP meta tag that does NOT match scripts/csp-policy.mjs (drift detected)"
        : "dist/index.html is missing the Content-Security-Policy meta tag"
    );
  }
}

// 2. docker/nginx-docker.conf — identical policy string served as a header.
const nginxConf = path.join(ROOT, "docker", "nginx-docker.conf");
if (!fs.existsSync(nginxConf)) {
  failures.push(`missing ${nginxConf}`);
} else {
  const conf = fs.readFileSync(nginxConf, "utf8");
  const m = conf.match(/add_header Content-Security-Policy "([^"]+)"\s*always;/);
  if (!m) {
    failures.push("docker/nginx-docker.conf has no Content-Security-Policy add_header");
  } else if (normalize(m[1]) !== normalize(CSP_POLICY)) {
    failures.push("docker/nginx-docker.conf CSP header does NOT match scripts/csp-policy.mjs (drift detected)");
  }
  if (!/frame-ancestors 'none'/.test(conf)) {
    failures.push("docker/nginx-docker.conf CSP header should enforce frame-ancestors 'none' (header-only directive)");
  }
}

if (failures.length > 0) {
  console.error("[check-csp-artifacts] FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("[check-csp-artifacts] OK — canonical CSP present in dist/index.html and nginx header");
