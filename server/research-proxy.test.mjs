/**
 * Phase 1 — research proxy HTTP hardening tests (hermetic: no upstream network).
 * An empty query short-circuits every fetcher before any egress, so the
 * happy-path test never leaves localhost.
 * Run: node --test server/research-proxy.test.mjs
 */
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { server, sanitizeApprovedDomains } from "./research-proxy.mjs";

let base = "";
const srv = server;

await new Promise((resolve) => {
  srv.listen(0, "127.0.0.1", () => {
    base = `http://127.0.0.1:${srv.address().port}`;
    resolve(null);
  });
});
after(() => srv.close());

async function post(path, { body, contentType = "application/json", origin } = {}) {
  const headers = {};
  if (contentType) headers["Content-Type"] = contentType;
  if (origin) headers.Origin = origin;
  return fetch(`${base}${path}`, { method: "POST", headers, body });
}

test("GET / returns the banner", async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
});

test("unknown route is 404 JSON", async () => {
  const res = await post("/nope", { body: "{}" });
  assert.equal(res.status, 404);
});

test("wrong content-type is 415", async () => {
  const res = await post("/research", { body: "query", contentType: "text/plain" });
  assert.equal(res.status, 415);
  const j = await res.json();
  assert.match(j.error, /content-type/i);
});

test("disallowed origin is 403", async () => {
  const res = await post("/research", { body: "{}", origin: "https://evil.example" });
  assert.equal(res.status, 403);
  const j = await res.json();
  assert.equal(j.error, "origin not allowed");
});

test("malformed JSON is 400", async () => {
  const res = await post("/research", { body: "{oops" });
  assert.equal(res.status, 400);
});

test("oversized body has its connection terminated", async () => {
  // DoS posture: the server destroys over-cap upload sockets instead of
  // answering, so the client observes ECONNRESET rather than a status code.
  const big = "x".repeat(300_000);
  await assert.rejects(post("/research", { body: JSON.stringify({ query: big }) }), (e) => {
    return e instanceof Error && /ECONNRESET|fetch failed/i.test(e.message);
  });
});

test("empty query succeeds without upstream egress", async () => {
  const res = await post("/research", { body: JSON.stringify({ query: "" }) });
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.equal(typeof j.context, "string");
  assert.ok(Array.isArray(j.sources));
});

test("sanitizeApprovedDomains caps and validates", () => {
  assert.deepEqual(sanitizeApprovedDomains(["Example.COM ", "bad host!", 42]), ["example.com"]);
  const many = Array.from({ length: 50 }, (_, i) => `h${i}.example.com`);
  assert.equal(sanitizeApprovedDomains(many).length, 20);
});
