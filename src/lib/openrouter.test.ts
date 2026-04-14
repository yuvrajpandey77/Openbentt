import { describe, it, expect } from "vitest";
import {
  isFreeModelId,
  isLikelyFreeModel,
  shortModelLabel,
  resolveChatCompletionsUrl,
  OPENROUTER_CHAT_URL,
  type OpenRouterModel,
} from "./openrouter";

describe("isFreeModelId", () => {
  it("detects :free suffix pattern", () => {
    expect(isFreeModelId("org/model:free")).toBe(true);
    expect(isFreeModelId("org/model")).toBe(false);
  });
});

describe("isLikelyFreeModel", () => {
  it("accepts :free ids", () => {
    expect(isLikelyFreeModel({ id: "x/y:free" })).toBe(true);
  });

  it("accepts zero pricing", () => {
    const m: OpenRouterModel = {
      id: "vendor/paid-style-id",
      pricing: { prompt: "0", completion: "0" },
    };
    expect(isLikelyFreeModel(m)).toBe(true);
  });
});

describe("shortModelLabel", () => {
  it("uses last path segment and strips :free", () => {
    expect(shortModelLabel("mistralai/mistral-small-3.2-24b-instruct:free")).toContain("mistral-small");
    expect(shortModelLabel("a/b:free")).toBe("b");
  });
});

describe("resolveChatCompletionsUrl", () => {
  it("defaults to OpenRouter", () => {
    expect(resolveChatCompletionsUrl("")).toBe(OPENROUTER_CHAT_URL);
  });

  it("appends chat/completions to OpenAI base", () => {
    expect(resolveChatCompletionsUrl("http://127.0.0.1:11434/v1")).toBe("http://127.0.0.1:11434/v1/chat/completions");
  });
});
