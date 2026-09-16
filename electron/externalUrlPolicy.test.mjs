/**
 * Phase 1 — centralized external-URL policy tests.
 * Run: node --test electron/externalUrlPolicy.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  isAllowedExternalUrl,
  isAllowedAppNavigationUrl,
  parseAllowedExternalUrl,
} from "./externalUrlPolicy.mjs";

test("allows ordinary https URLs", () => {
  assert.equal(isAllowedExternalUrl("https://openrouter.ai/api/v1/models"), true);
  assert.equal(isAllowedExternalUrl("https://arxiv.org/abs/1234.5678"), true);
});

test("denies non-https schemes", () => {
  for (const u of [
    "http://example.com/",
    "file:///etc/passwd",
    "javascript:alert(1)",
    "data:text/html,<h1>x</h1>",
    "blob:https://example.com/uuid",
    "app://openbentt/projects",
    "openbentt://chat",
    "ftp://example.com/f",
  ]) {
    assert.equal(isAllowedExternalUrl(u), false, u);
  }
});

test("denies credential-bearing https URLs", () => {
  assert.equal(isAllowedExternalUrl("https://user:pass@example.com/"), false);
  assert.equal(isAllowedExternalUrl("https://user@example.com/"), false);
});

test("denies non-string, empty, and control-char input", () => {
  for (const u of [undefined, null, 42, {}, "", "   ", "https://exam\nple.com/", "https://example.com/\u0000"]) {
    assert.equal(isAllowedExternalUrl(u), false, String(u));
  }
});

test("parseAllowedExternalUrl returns a URL for allowed input", () => {
  const u = parseAllowedExternalUrl("https://example.com/path?q=1");
  assert.ok(u instanceof URL);
  assert.equal(u.hostname, "example.com");
  assert.equal(parseAllowedExternalUrl("http://example.com/"), null);
});

test("in-app navigation allowlist", () => {
  assert.equal(isAllowedAppNavigationUrl("app://openbentt/projects"), true);
  assert.equal(isAllowedAppNavigationUrl("app://openbentt/chat?x=1#y"), true);
  assert.equal(isAllowedAppNavigationUrl("http://127.0.0.1:8080/projects"), true);
  assert.equal(isAllowedAppNavigationUrl("http://localhost:8080/chat"), true);
  assert.equal(isAllowedAppNavigationUrl("https://openrouter.ai/"), false);
  assert.equal(isAllowedAppNavigationUrl("http://127.0.0.1:9999/"), false);
  assert.equal(isAllowedAppNavigationUrl("file:///etc/passwd"), false);
  assert.equal(isAllowedAppNavigationUrl(""), false);
  assert.equal(isAllowedAppNavigationUrl(undefined), false);
});
