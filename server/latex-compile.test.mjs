/**
 * Phase 1 — latex-compile hardening tests.
 * Validation tests are hermetic; the happy-path compile test requires pdflatex
 * on PATH and is skipped otherwise (CI without TeX still covers validation).
 * Run: node --test server/latex-compile.test.mjs
 */
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { server, resolveInside } from "./latex-compile.mjs";

const HAVE_PDFLATEX = (() => {
  try {
    return spawnSync("pdflatex", ["--version"], { encoding: "utf8", timeout: 15_000 }).status === 0;
  } catch {
    return false;
  }
})();

let base = "";
await new Promise((resolve) => {
  server.listen(0, "127.0.0.1", () => {
    base = `http://127.0.0.1:${server.address().port}`;
    resolve(null);
  });
});
after(() => server.close());

async function postCompile(body, contentType) {
  return fetch(`${base}/compile`, {
    method: "POST",
    headers: contentType ? { "Content-Type": contentType } : {},
    body,
  });
}

test("GET /health reports status", async () => {
  const res = await fetch(`${base}/health`);
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.equal(j.ok, true);
  assert.equal(typeof j.pdflatex, "boolean");
});

test("unknown route is 404", async () => {
  const res = await fetch(`${base}/nope`, { method: "POST" });
  assert.equal(res.status, 404);
});

test("unsupported content-type is 415", async () => {
  const res = await postCompile("x", "application/xml");
  assert.equal(res.status, 415);
});

test("empty body is 400", async () => {
  const res = await postCompile("   ", "text/plain; charset=utf-8");
  // Without pdflatex the server answers 503 first; with pdflatex, 400.
  assert.ok(res.status === 400 || res.status === 503, `status ${res.status}`);
});

test("malformed JSON bundle is 400", async () => {
  const res = await postCompile("{oops", "application/json");
  assert.ok(res.status === 400 || res.status === 503, `status ${res.status}`);
});

test("oversized body has its connection terminated", async () => {
  const big = "x".repeat(9 * 1024 * 1024);
  await assert.rejects(postCompile(big, "text/plain; charset=utf-8"), (e) => {
    return e instanceof Error && /ECONNRESET|fetch failed/i.test(e.message);
  });
});

test("resolveInside blocks traversal and absolute paths", () => {
  assert.throws(() => resolveInside("/tmp/d", "../evil.tex"), /escapes|bad path/);
  assert.throws(() => resolveInside("/tmp/d", "a/../../evil.tex"), /escapes|bad path/);
  assert.throws(() => resolveInside("/tmp/d", "/etc/passwd"), /escapes|bad path/);
  assert.throws(() => resolveInside("/tmp/d", ""), /bad path/);
  assert.ok(resolveInside("/tmp/d", "main.tex").endsWith("main.tex"));
  assert.ok(resolveInside("/tmp/d", "chapters/intro.tex").includes("chapters"));
});

test("bundle traversal is rejected with 400", { skip: !HAVE_PDFLATEX }, async () => {
  const payload = JSON.stringify({ mainTex: "hello", mainPath: "../evil.tex", files: [] });
  const res = await postCompile(payload, "application/json");
  assert.equal(res.status, 400);
});

test("minimal document compiles to PDF", { skip: !HAVE_PDFLATEX }, async () => {
  const tex = "\\documentclass{article}\\begin{document}Hello Phase 1.\\end{document}";
  const res = await postCompile(tex, "text/plain; charset=utf-8");
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /application\/pdf/);
  const buf = Buffer.from(await res.arrayBuffer());
  assert.ok(buf.subarray(0, 5).toString() === "%PDF-");
});
