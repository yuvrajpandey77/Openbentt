import { describe, expect, it } from "vitest";
import { threadToLatexDraft, threadSummaryMarkdown } from "@/lib/research/threadToPaper";
import type { Chat } from "@/types/chat";

function chat(messages: Chat["messages"]): Chat {
  const now = new Date();
  return {
    id: "c1",
    title: "Research thread",
    createdAt: now,
    updatedAt: now,
    messages,
  };
}

describe("threadToPaper", () => {
  it("exports markdown outline from thread", () => {
    const md = threadSummaryMarkdown(
      chat([
        {
          role: "user",
          content: "Survey PDF citation tools",
          id: "1",
          timestamp: new Date(),
        },
        {
          role: "assistant",
          content: "Key themes include parsing and privacy.".repeat(5),
          id: "2",
          timestamp: new Date(),
        },
      ])
    );
    expect(md).toContain("Research thread export");
    expect(md).toContain("Survey PDF");
  });

  it("builds LaTeX skeleton from thread when no outline sections", () => {
    const tex = threadToLatexDraft(
      chat([{ role: "user", content: "Write intro", id: "1", timestamp: new Date() }])
    );
    expect(tex).toContain("\\documentclass");
    expect(tex).toContain("\\section{");
    expect(tex).toContain("Write intro");
  });
});
