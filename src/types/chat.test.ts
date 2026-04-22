import { describe, it, expect } from "vitest";
import {
  dedupeModels,
  normalizeApiConfig,
  defaultApiConfig,
  DEFAULT_MODEL_ID,
  DEPRECATED_DEFAULT_MODEL_IDS,
} from "./chat";
import { DEFAULT_LOCAL_GEMMA_MODEL_ID } from "@/lib/gemmaWebGpu/models";

describe("dedupeModels", () => {
  it("trims, dedupes, preserves order", () => {
    expect(dedupeModels([" a ", "a", "b"])).toEqual(["a", "b"]);
    expect(dedupeModels(["x/y:free", "x/y:free"])).toEqual(["x/y:free"]);
  });
});

describe("normalizeApiConfig", () => {
  it("fills defaults for empty partial", () => {
    const d = defaultApiConfig();
    expect(normalizeApiConfig({}).aiProvider).toBe(d.aiProvider);
    expect(normalizeApiConfig({}).model).toBe(d.model);
  });

  it("preserves model and caps comparison list", () => {
    const n = normalizeApiConfig({
      apiKey: "sk-test",
      model: "foo/bar:free",
      comparisonModelIds: ["a", "b", "c", "d", "e"],
      comparisonEnabled: true,
      customModelIds: ["  paid/model  "],
    });
    expect(n.model).toBe("foo/bar:free");
    expect(n.comparisonModelIds).toHaveLength(4);
    expect(n.comparisonModelIds[0]).toBe("a");
    expect(n.customModelIds).toEqual(["paid/model"]);
  });

  it("uses primary model when comparison list empty", () => {
    const n = normalizeApiConfig({
      model: "m/m:free",
      comparisonModelIds: [],
    });
    expect(n.comparisonModelIds).toEqual(["m/m:free"]);
  });
});

describe("DEFAULT_MODEL_ID", () => {
  it("is a :free id", () => {
    expect(DEFAULT_MODEL_ID).toContain(":free");
  });

  it("is not itself listed as deprecated", () => {
    expect(DEPRECATED_DEFAULT_MODEL_IDS).not.toContain(DEFAULT_MODEL_ID);
  });
});

describe("normalizeApiConfig migrations", () => {
  it("rewrites deprecated default model ids to current default", () => {
    for (const stale of DEPRECATED_DEFAULT_MODEL_IDS) {
      const n = normalizeApiConfig({ model: stale });
      expect(n.model).toBe(DEFAULT_MODEL_ID);
    }
  });

  it("does not rewrite user-selected model ids that aren't deprecated", () => {
    const n = normalizeApiConfig({ model: "some/user-picked:free" });
    expect(n.model).toBe("some/user-picked:free");
  });

  it("normalizes webgpu_gemma to local model and disables comparison", () => {
    const n = normalizeApiConfig({
      aiProvider: "webgpu_gemma",
      model: "meta-llama/llama-3.3-70b-instruct:free",
      comparisonEnabled: true,
      comparisonModelIds: ["a", "b"],
    });
    expect(n.model).toBe(DEFAULT_LOCAL_GEMMA_MODEL_ID);
    expect(n.comparisonEnabled).toBe(false);
    expect(n.comparisonModelIds).toEqual([DEFAULT_LOCAL_GEMMA_MODEL_ID]);
  });
});
