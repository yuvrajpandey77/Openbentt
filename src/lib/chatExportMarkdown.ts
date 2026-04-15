import type { Chat, Message } from "@/types/chat";
import { buildAssistantPlainText } from "@/lib/assistantPlainText";

function messageToMarkdown(m: Message): string {
  const ts = m.timestamp instanceof Date ? m.timestamp.toISOString() : String(m.timestamp);
  if (m.role === "user") {
    let block = m.content.trim();
    if (m.attachments?.length) {
      const names = m.attachments.map((a) => a.name).join(", ");
      block += `\n\n_(${m.attachments.length} attachment(s): ${names})_`;
    }
    return `### User · ${ts}\n\n${block}\n`;
  }
  const body = buildAssistantPlainText(m);
  return `### Assistant · ${ts}\n\n${body}\n`;
}

/** Full conversation as GitHub-flavored Markdown for backup / publishing. */
export function buildChatMarkdownExport(chat: Chat): string {
  const header = `# ${chat.title}\n\n_Exported from Openbentt · ${new Date().toISOString()}_ · ${chat.messages.length} message(s)\n\n---\n\n`;
  const body = chat.messages.map(messageToMarkdown).join("\n---\n\n");
  return header + body;
}

export function downloadTextFile(filename: string, content: string, mime = "text/markdown;charset=utf-8"): void {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
