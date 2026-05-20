import type { Message } from "@/types/chat";
import type { ModelTask } from "./tasks";

/** Pick a model route when a user message includes notebook hybrid retrieval evidence. */
export function detectNotebookRoutedTask(messages: Message[]): ModelTask | null {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const content = lastUser?.content ?? "";
  if (!content.includes("[RESEARCH_CORPUS_EVIDENCE")) return null;
  if (/literature review|cross-paper synthesis/i.test(content)) return "chat_synthesis";
  return "chat_drafting";
}
