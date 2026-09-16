/**
 * Phase 1 — main-process logger tests.
 * Run: node --test electron/log.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createLogger } from "./log.mjs";

function capture(level) {
  const lines = [];
  const orig = console[level];
  console[level] = (line) => lines.push(String(line));
  return {
    lines,
    restore: () => {
      console[level] = orig;
    },
  };
}

test("emits structured JSON with timestamp, level, component", () => {
  const cap = capture("info");
  try {
    createLogger("test-comp").info("hello world", { n: 1 });
  } finally {
    cap.restore();
  }
  assert.equal(cap.lines.length, 1);
  const entry = JSON.parse(cap.lines[0]);
  assert.equal(entry.level, "info");
  assert.equal(entry.component, "test-comp");
  assert.equal(entry.message, "hello world");
  assert.deepEqual(entry.meta, { n: 1 });
  assert.ok(!Number.isNaN(Date.parse(entry.ts)));
});

test("redacts secret values in messages and secret keys in meta", () => {
  const cap = capture("error");
  try {
    createLogger("c").error("provider said no to sk-or-v1-SECRETSECRET12", {
      apiKey: "sk-abc",
      safe: "fine",
    });
  } finally {
    cap.restore();
  }
  const line = cap.lines[0];
  assert.ok(!line.includes("SECRETSECRET12"), line);
  assert.ok(!line.includes("sk-abc"), line);
  assert.ok(line.includes("[redacted-secret]"), line);
  assert.ok(line.includes("[redacted]"), line);
  assert.ok(line.includes("fine"), line);
});

test("debug is gated behind OPENBENTT_VERBOSE", () => {
  delete process.env.OPENBENTT_VERBOSE;
  const cap = capture("debug");
  try {
    createLogger("c").debug("quiet please");
  } finally {
    cap.restore();
  }
  assert.equal(cap.lines.length, 0);
  process.env.OPENBENTT_VERBOSE = "1";
  const cap2 = capture("debug");
  try {
    createLogger("c").debug("loud now");
  } finally {
    cap2.restore();
  }
  assert.equal(cap2.lines.length, 1);
  delete process.env.OPENBENTT_VERBOSE;
});
