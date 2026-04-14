import { describe, it, expect } from "vitest";
import { dedupeModels, normalizeApiConfig, defaultApiConfig, DEFAULT_MODEL_ID } from "./chat";

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
});
