import { describe, it, expect } from "vitest";
import { isStopSpecialTokenChunk, stripSpecialTokens } from "./stripGemmaStreamChunk";

describe("stripSpecialTokens", () => {
  it("removes Qwen ChatML end markers", () => {
    expect(stripSpecialTokens("Hello!<|im_end|>")).toBe("Hello!");
    expect(stripSpecialTokens("<|im_start|>assistant\nHi<|im_end|>")).toBe("assistant\nHi");
  });

  it("removes leftover <|...|> markers", () => {
    expect(stripSpecialTokens("ok <|foo_bar|> done")).toBe("ok  done");
  });

  it("keeps normal text", () => {
    expect(stripSpecialTokens("plain answer")).toBe("plain answer");
  });
});

describe("isStopSpecialTokenChunk", () => {
  it("detects stop tokens", () => {
    expect(isStopSpecialTokenChunk("<|im_end|>")).toBe(true);
    expect(isStopSpecialTokenChunk(" hello ")).toBe(false);
  });
});
