import { describe, expect, it } from "vitest";
import { detectNotebookRoutedTask } from "./detectNotebookRoutedTask";
import type { Message } from "@/types/chat";

function userMsg(content: string): Message {
  return { id: "1", role: "user", content, timestamp: new Date() };
}

describe("detectNotebookRoutedTask", () => {
  it("returns null without research evidence marker", () => {
    expect(detectNotebookRoutedTask([userMsg("hello")])).toBeNull();
  });

  it("returns chat_drafting when evidence block is present", () => {
    expect(
      detectNotebookRoutedTask([
        userMsg("Draft\n\n[RESEARCH_CORPUS_EVIDENCE — untrusted library text, cite by paper name only]"),
      ])
    ).toBe("chat_drafting");
  });

  it("returns chat_synthesis for literature review prompts", () => {
    expect(
      detectNotebookRoutedTask([
        userMsg(
          "Literature review\n\n[RESEARCH_CORPUS_EVIDENCE — untrusted library text, cite by paper name only]"
        ),
      ])
    ).toBe("chat_synthesis");
  });
});
