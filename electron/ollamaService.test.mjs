import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  aggregatePullProgress,
  assertOllamaModelName,
  installInfoForPlatform,
  normalizeOllamaOrigin,
  parsePullLine,
  rankInstalledModels,
} from "./ollamaService.mjs";

describe("ollama origin allowlist", () => {
  it("accepts loopback defaults", () => {
    assert.equal(normalizeOllamaOrigin(undefined), "http://127.0.0.1:11434");
    assert.equal(normalizeOllamaOrigin("http://localhost:11434"), "http://localhost:11434");
  });
  it("rejects remote hosts", () => {
    assert.throws(() => normalizeOllamaOrigin("http://evil.example.com:11434"), /loopback/);
    assert.throws(() => normalizeOllamaOrigin("https://127.0.0.1:11434"), /http loopback/);
    assert.throws(() => normalizeOllamaOrigin("http://127.0.0.1:11434@evil.com/"), /loopback/);
  });
});

describe("ollama model name allowlist", () => {
  it("accepts registry names", () => {
    assert.equal(assertOllamaModelName("qwen3:1.7b"), "qwen3:1.7b");
    assert.equal(assertOllamaModelName("hf.co/bartowski/gemma-3-1b-GGUF"), "hf.co/bartowski/gemma-3-1b-GGUF");
  });
  it("rejects shell injection", () => {
    for (const bad of ["a; rm -rf /", "$(evil)", "a|b", "a`b`", "..", ""]) {
      assert.throws(() => assertOllamaModelName(bad), /Invalid model name/);
    }
  });
});

describe("pull progress aggregation", () => {
  it("aggregates per-digest totals", () => {
    const agg = aggregatePullProgress("qwen3:1.7b", [
      parsePullLine('{"status":"pulling manifest"}'),
      parsePullLine('{"status":"downloading","digest":"sha256:a","total":100,"completed":50}'),
      parsePullLine('{"status":"downloading","digest":"sha256:b","total":100,"completed":100}'),
    ]);
    assert.equal(agg.total, 200);
    assert.equal(agg.completed, 150);
    assert.equal(agg.percent, 75);
  });
  it("ignores blank lines", () => {
    assert.equal(parsePullLine("   "), null);
    assert.equal(parsePullLine("not json"), null);
  });
});

describe("model ranking prefers usable chat models", () => {
  it("ranks small instruct models first, embeddings last", () => {
    const ranked = rankInstalledModels(["nomic-embed-text", "llama3.2:70b", "qwen3:1.7b", "smollm2:1.7b"]);
    assert.equal(ranked[ranked.length - 1], "nomic-embed-text");
    assert.ok(["qwen3:1.7b", "smollm2:1.7b"].includes(ranked[0]));
  });
});

describe("install info", () => {
  it("points at the official distribution only", () => {
    for (const p of ["linux", "darwin", "win32"]) {
      const info = installInfoForPlatform(p);
      assert.equal(info.supported, true);
      assert.equal(info.downloadUrl, "https://ollama.com/download");
      assert.ok(info.steps.length >= 2);
    }
  });
});
