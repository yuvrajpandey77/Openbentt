import { describe, it, expect, vi, beforeEach } from "vitest";
import { getComposerPlaceholder } from "./composerPlaceholder";
import { defaultApiConfig, normalizeApiConfig } from "@/types/chat";
import { GGUF_MODEL_NONE } from "@/lib/localGguf/ids";

vi.mock("@/lib/gemmaWebGpu/localModelConsent", () => ({
  getLocalWeightsConsent: vi.fn(() => false),
}));

import { getLocalWeightsConsent } from "@/lib/gemmaWebGpu/localModelConsent";

describe("getComposerPlaceholder", () => {
  beforeEach(() => {
    vi.mocked(getLocalWeightsConsent).mockReturnValue(false);
  });

  it("returns loading text when config is loading", () => {
    expect(getComposerPlaceholder(defaultApiConfig(), { isLoadingConfig: true })).toBe("Loading…");
  });

  it("guides OpenRouter users without a key", () => {
    const cfg = normalizeApiConfig({ aiProvider: "openrouter", apiKey: "" });
    expect(getComposerPlaceholder(cfg)).toContain("API key");
  });

  it("guides local GGUF users without a selected model", () => {
    const cfg = normalizeApiConfig({ aiProvider: "local_gguf", model: GGUF_MODEL_NONE });
    const text = getComposerPlaceholder(cfg);
    expect(text.toLowerCase()).toMatch(/labs|gguf|settings/);
  });

  it("uses workspace placeholder when configured and ready", () => {
    const cfg = normalizeApiConfig({
      aiProvider: "openrouter",
      apiKey: "sk-test",
      model: "meta-llama/llama-3.3-70b-instruct:free",
    });
    expect(
      getComposerPlaceholder(cfg, { workspacePlaceholder: "Ask about this notebook…" })
    ).toBe("Ask about this notebook…");
  });

  it("shows comparison hint when enabled", () => {
    const cfg = normalizeApiConfig({
      aiProvider: "openrouter",
      apiKey: "sk-test",
      comparisonEnabled: true,
    });
    expect(getComposerPlaceholder(cfg)).toContain("each selected model");
  });

  it("shows webgpu consent hint when provider is webgpu without consent", () => {
    vi.mocked(getLocalWeightsConsent).mockReturnValue(false);
    const cfg = normalizeApiConfig({ aiProvider: "webgpu_gemma" });
    expect(getComposerPlaceholder(cfg)).toContain("on-device");
  });

  it("shows default prompt when ready to chat", () => {
    vi.mocked(getLocalWeightsConsent).mockReturnValue(true);
    const cfg = normalizeApiConfig({
      aiProvider: "openrouter",
      apiKey: "sk-test",
    });
    expect(getComposerPlaceholder(cfg)).toContain("Ask anything");
  });

  it("shows short web placeholder when ready to chat", () => {
    vi.mocked(getLocalWeightsConsent).mockReturnValue(true);
    const cfg = normalizeApiConfig({
      aiProvider: "openrouter",
      apiKey: "sk-test",
    });
    expect(getComposerPlaceholder(cfg, { webChat: true })).toBe("Ask Obent");
  });

  it("uses default prompt for openai_compatible when base URL is set", () => {
    const cfg = normalizeApiConfig({
      aiProvider: "openai_compatible",
      openAiCompatibleBaseUrl: "http://127.0.0.1:11434/v1",
      model: "llama3.2",
    });
    expect(getComposerPlaceholder(cfg)).toContain("Ask anything");
  });
});
