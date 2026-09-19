import { describe, it, expect } from "vitest";
import { autoSelectOllamaModel, isChatUsableModel, friendlyModelLabel } from "./selection";

describe("autoSelectOllamaModel", () => {
  it("prefers an explicit preference when still installed", () => {
    const r = autoSelectOllamaModel(["qwen3:1.7b", "llama3.2:3b"], "llama3.2:3b");
    expect(r).toEqual({ selected: "llama3.2:3b", reason: "explicit-preference" });
  });

  it("falls back to auto discovery when the preference is gone", () => {
    const r = autoSelectOllamaModel(["qwen3:1.7b"], "deleted:model");
    expect(r).toEqual({ selected: "qwen3:1.7b", reason: "auto-discovered" });
  });

  it("prefers small instruct models over large ones", () => {
    const r = autoSelectOllamaModel(["llama3.1:70b", "qwen3:1.7b"]);
    expect(r.selected).toBe("qwen3:1.7b");
  });

  it("never selects embedding-only models", () => {
    const r = autoSelectOllamaModel(["nomic-embed-text", "mxbai-embed-large"]);
    expect(r).toEqual({ selected: null, reason: "no-usable-model" });
  });

  it("returns null (never a download) when nothing is installed", () => {
    expect(autoSelectOllamaModel([]).selected).toBeNull();
  });
});

describe("isChatUsableModel", () => {
  it("rejects embeddings, accepts chat models", () => {
    expect(isChatUsableModel("nomic-embed-text")).toBe(false);
    expect(isChatUsableModel("qwen3:1.7b")).toBe(true);
    expect(isChatUsableModel("")).toBe(false);
  });
});

describe("friendlyModelLabel", () => {
  it("formats registry names for display", () => {
    expect(friendlyModelLabel("qwen3:1.7b")).toBe("qwen3 1.7B");
  });
});
