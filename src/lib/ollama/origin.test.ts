import { describe, it, expect } from "vitest";
import {
  openAiCompatibleBaseUrlToOllamaOrigin,
  prefersLocalOllamaInference,
  ollamaModelMatches,
  DEFAULT_OLLAMA_API_ORIGIN,
} from "@/lib/ollama/origin";

describe("ollama origin helpers", () => {
  it("strips /v1 for IPC origin", () => {
    expect(openAiCompatibleBaseUrlToOllamaOrigin("http://127.0.0.1:11434/v1")).toBe(
      "http://127.0.0.1:11434"
    );
    expect(openAiCompatibleBaseUrlToOllamaOrigin("http://localhost:11434")).toBe(
      "http://localhost:11434"
    );
    expect(openAiCompatibleBaseUrlToOllamaOrigin("")).toBe(DEFAULT_OLLAMA_API_ORIGIN);
    expect(openAiCompatibleBaseUrlToOllamaOrigin("https://api.example.com/v1")).toBe(null);
  });

  it("detects local Ollama preference", () => {
    expect(
      prefersLocalOllamaInference({
        aiProvider: "openai_compatible",
        openAiCompatibleBaseUrl: "http://127.0.0.1:11434/v1",
      })
    ).toBe(true);
    expect(
      prefersLocalOllamaInference({
        aiProvider: "openai_compatible",
        openAiCompatibleBaseUrl: "https://api.openai.com/v1",
      })
    ).toBe(false);
    expect(
      prefersLocalOllamaInference({
        aiProvider: "openrouter",
        openAiCompatibleBaseUrl: "",
      })
    ).toBe(false);
    expect(
      prefersLocalOllamaInference({
        aiProvider: "local_gguf",
        openAiCompatibleBaseUrl: "",
      })
    ).toBe(true);
  });

  it("fuzzy-matches ollama model tags", () => {
    expect(ollamaModelMatches("qwen3:0.6b", ["qwen3:0.6b"])).toBe(true);
    expect(ollamaModelMatches("qwen3:0.6b", ["qwen3:latest"])).toBe(false);
    expect(ollamaModelMatches("qwen3", ["qwen3:0.6b"])).toBe(true);
    expect(ollamaModelMatches("qwen3:0.6b", ["qwen3"])).toBe(true);
    expect(ollamaModelMatches("llama3", ["qwen3:0.6b"])).toBe(false);
  });
});
