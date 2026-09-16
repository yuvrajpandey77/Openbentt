/**
 * Phase 1 — server/httpPolicy.mjs unit tests (no network).
 * Run: node --test server/httpPolicy.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import {
  parseAllowedOrigins,
  isOriginAllowed,
  createRateLimiter,
  fetchWithTimeout,
} from "./httpPolicy.mjs";

const req = (headers) => ({ headers });

test("parseAllowedOrigins splits and trims", () => {
  assert.deepEqual(parseAllowedOrigins("https://a.example, https://b.example:8080"), [
    "https://a.example",
    "https://b.example:8080",
  ]);
  assert.deepEqual(parseAllowedOrigins(""), []);
  assert.deepEqual(parseAllowedOrigins(undefined), []);
});

test("missing or null origin is allowed (non-browser callers)", () => {
  assert.equal(isOriginAllowed(req({}), []), true);
  assert.equal(isOriginAllowed(req({ origin: "null" }), []), true);
});

test("same-origin (Host match) is allowed", () => {
  assert.equal(isOriginAllowed(req({ origin: "http://myhost:8080", host: "myhost:8080" }), []), true);
  assert.equal(isOriginAllowed(req({ origin: "http://myhost:8080", host: "other:8080" }), []), false);
});

test("loopback and packaged-app origins are allowed", () => {
  assert.equal(isOriginAllowed(req({ origin: "http://127.0.0.1:8787", host: "x" }), []), true);
  assert.equal(isOriginAllowed(req({ origin: "http://localhost:3000", host: "x" }), []), true);
  assert.equal(isOriginAllowed(req({ origin: "app://openbentt", host: "x" }), []), true);
});

test("arbitrary web origins require the allowlist", () => {
  assert.equal(isOriginAllowed(req({ origin: "https://evil.example", host: "myhost:8080" }), []), false);
  assert.equal(
    isOriginAllowed(req({ origin: "https://app.example.com", host: "proxy.example.com" }), [
      "https://app.example.com",
    ]),
    true
  );
  assert.equal(
    isOriginAllowed(req({ origin: "https://app.example.com.evil.com", host: "h" }), ["https://app.example.com"]),
    false
  );
});

test("unparseable origin is denied", () => {
  assert.equal(isOriginAllowed(req({ origin: "::::", host: "h" }), []), false);
});

test("rate limiter allows then 429s", () => {
  const limiter = createRateLimiter({ perMin: 3, windowMs: 60_000 });
  assert.equal(limiter.check("1.2.3.4").ok, true);
  assert.equal(limiter.check("1.2.3.4").ok, true);
  assert.equal(limiter.check("1.2.3.4").ok, true);
  const fourth = limiter.check("1.2.3.4");
  assert.equal(fourth.ok, false);
  assert.ok(fourth.retryAfterMs > 0);
  // Separate client unaffected.
  assert.equal(limiter.check("5.6.7.8").ok, true);
});

test("fetchWithTimeout aborts a hanging upstream", async () => {
  const hanging = http.createServer(() => {});
  await new Promise((resolve) => hanging.listen(0, "127.0.0.1", resolve));
  const port = hanging.address().port;
  try {
    await assert.rejects(fetchWithTimeout(`http://127.0.0.1:${port}/`, {}, 200), (e) => {
      return e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    });
  } finally {
    hanging.close();
  }
});
