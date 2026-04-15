import { describe, it, expect } from "vitest";
import { buildChatMarkdownExport } from "./chatExportMarkdown";
import type { Chat } from "@/types/chat";

describe("buildChatMarkdownExport", () => {
  it("includes title and message bodies", () => {
    const chat: Chat = {
      id: "c1",
      title: "Test chat",
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-02"),
      messages: [
        {
          id: "m1",
          role: "user",
          content: "Hello",
          timestamp: new Date("2026-01-01T12:00:00Z"),
        },
        {
          id: "m2",
          role: "assistant",
          content: "Hi there",
          timestamp: new Date("2026-01-01T12:00:01Z"),
        },
      ],
    };
    const md = buildChatMarkdownExport(chat);
    expect(md).toContain("# Test chat");
    expect(md).toContain("### User");
    expect(md).toContain("Hello");
    expect(md).toContain("### Assistant");
    expect(md).toContain("Hi there");
  });
});
