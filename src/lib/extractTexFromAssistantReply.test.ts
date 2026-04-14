import { describe, expect, it } from "vitest";
import { extractTexFromAssistantReply } from "./extractTexFromAssistantReply";

describe("extractTexFromAssistantReply", () => {
  it("extracts latex fenced block", () => {
    const raw = ["Here:", "```latex", "\\documentclass{book}", "```"].join("\n");
    expect(extractTexFromAssistantReply(raw)).toContain("\\documentclass{book}");
  });

  it("prefers block with documentclass when multiple", () => {
    const raw = ["```", "scratch", "```", "```latex", "\\documentclass{article}", "\\begin{document}", "\\end{document}", "```"].join("\n");
    expect(extractTexFromAssistantReply(raw)).toContain("\\documentclass{article}");
  });
});
