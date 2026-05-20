import type { Chat } from "@/types/chat";
import { buildAssistantPlainText } from "@/lib/assistantPlainText";
import { outlineToLatexSkeleton, parseOutline } from "@/lib/research/latexTools";

function messagesToOutline(chat: Chat): string {
  const lines: string[] = ["# Research thread export", "", `## ${chat.title}`, ""];
  for (const m of chat.messages) {
    if (m.role === "user") {
      lines.push(`### Prompt`, "", m.content.trim(), "");
    } else {
      const body = buildAssistantPlainText(m).trim();
      if (body.length > 40) {
        lines.push(`### Assistant insight`, "", body.slice(0, 2000), "");
      }
    }
  }
  return lines.join("\n");
}

export function threadToLatexDraft(chat: Chat, existingPreamble?: string): string {
  const outline = messagesToOutline(chat);
  const sections = parseOutline(outline);
  if (sections.length === 0) {
    return outlineToLatexSkeleton(
      [
        { level: 1, title: "Introduction", body: "% From chat thread\n" },
        { level: 1, title: "Discussion summary", body: chat.messages.map((m) => m.content).join("\n\n").slice(0, 4000) },
      ],
      existingPreamble
    );
  }
  return outlineToLatexSkeleton(sections, existingPreamble);
}

export function threadSummaryMarkdown(chat: Chat): string {
  return messagesToOutline(chat);
}
