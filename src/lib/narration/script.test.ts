import { describe, expect, it } from "vitest";
import { buildNarrationScript, stripSpeakMarkup } from "./script";

describe("narration script", () => {
  it("strips markdown and keeps the words", () => {
    expect(stripSpeakMarkup("**B** [minor](https://example.com) scale")).toBe("B minor scale");
  });

  it("splits a reply into spoken lines and leaves code unread", () => {
    const chunks = buildNarrationScript("B minor sounds dark.\n\nThe next note is C#.\n\n```ts\nconst x = 1;\n```");
    const spoken = chunks.filter((c) => c.speak).map((c) => c.speak);
    expect(spoken).toEqual(["B minor sounds dark.", "The next note is C#."]);
    expect(chunks.some((c) => c.speak === null && c.markdown.includes("const x"))).toBe(true);
  });
});