import { describe, it, expect } from "vitest";
import { chatCompletionMessagesToGemmaPrompt } from "./gemmaPrompt";

describe("chatCompletionMessagesToGemmaPrompt", () => {
  it("builds Gemma turn blocks and ends with model turn", () => {
    const p = chatCompletionMessagesToGemmaPrompt([
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Hi" },
    ]);
    expect(p).toContain("<|turn>system");
    expect(p).toContain("You are helpful.");
    expect(p).toContain("<|turn>user");
    expect(p).toContain("Hi");
    expect(p.endsWith("<|turn>model")).toBe(true);
  });

  it("notes when multimodal user parts include non-text", () => {
    const p = chatCompletionMessagesToGemmaPrompt([
      {
        role: "user",
        content: [
          { type: "text", text: "Hello" },
          { type: "image_url", image_url: { url: "data:image/png;base64,xx" } },
        ],
      },
    ]);
    expect(p).toContain("Hello");
    expect(p).toContain("[Note: image/audio parts are omitted");
  });
});
