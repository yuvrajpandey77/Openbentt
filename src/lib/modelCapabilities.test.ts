import { describe, it, expect } from "vitest";
import { inferModelCapabilities } from "./modelCapabilities";

describe("inferModelCapabilities", () => {
  it("marks gpt-4o as vision", () => {
    const c = inferModelCapabilities("openai/gpt-4o");
    expect(c.vision).toBe(true);
    expect(c.text).toBe(true);
    expect(c.source).toBe("heuristic");
  });

  it("marks text-only ids without vision hint", () => {
    const c = inferModelCapabilities("mistralai/mistral-small-3.2-24b-instruct:free");
    expect(c.vision).toBe(false);
  });

  it("detects reasoning-heavy ids", () => {
    expect(inferModelCapabilities("o1-preview").reasoningHeavy).toBe(true);
    expect(inferModelCapabilities("deepseek-r1").reasoningHeavy).toBe(true);
  });

  it("uses OpenRouter architecture when provided", () => {
    const c = inferModelCapabilities("x/y", {
      id: "x/y",
      architecture: { input_modalities: ["text", "image"], output_modalities: ["text"] },
    });
    expect(c.source).toBe("openrouter");
    expect(c.vision).toBe(true);
  });
});
