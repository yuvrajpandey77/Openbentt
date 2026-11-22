import type { Message } from "@/types/chat";
import { estimateConversationTokens, estimateTokensFromText } from "@/lib/contextMeter";

export type CompactChatOptions = {
  /** Soft token budget for conversation messages (system prompts counted separately). */
  maxTokens: number;
  /** Always keep this many trailing messages verbatim. */
  keepRecent?: number;
};

/**
 * Extractive history compaction for long threads.
 * Older turns collapse into a single synthetic user note so the API send fits the model window.
 * Does not call an LLM — deterministic and free.
 */
export function compactMessagesForContext(
  messages: Message[],
  opts: CompactChatOptions
): Message[] {
  const keepRecent = Math.max(2, opts.keepRecent ?? 12);
  const maxTokens = Math.max(512, opts.maxTokens);
  if (messages.length <= keepRecent) return messages;
  if (estimateConversationTokens(messages) <= maxTokens) return messages;

  const recent = messages.slice(-keepRecent);
  let head = messages.slice(0, -keepRecent);

  // Drop oldest head messages until recent + remaining head fit, then summarize dropped.
  const dropped: Message[] = [];
  while (
    head.length > 0 &&
    estimateConversationTokens([...head, ...recent]) > maxTokens
  ) {
    dropped.push(head[0]);
    head = head.slice(1);
  }

  if (dropped.length === 0 && estimateConversationTokens([...head, ...recent]) <= maxTokens) {
    return [...head, ...recent];
  }

  const summaryLines = dropped.map((m, i) => {
    const role = m.role === "assistant" ? "A" : m.role === "user" ? "U" : m.role;
    const body = (m.content ?? "").replace(/\s+/g, " ").trim().slice(0, 220);
    return `${i + 1}. [${role}] ${body}${body.length >= 220 ? "…" : ""}`;
  });

  let summaryContent =
    `[Earlier conversation compacted — ${dropped.length} message(s) summarized for context limits]\n` +
    summaryLines.join("\n");

  // Ensure the summary itself does not blow the budget.
  while (
    estimateTokensFromText(summaryContent) + estimateConversationTokens([...head, ...recent]) >
      maxTokens &&
    summaryLines.length > 2
  ) {
    summaryLines.pop();
    summaryContent =
      `[Earlier conversation compacted — ${dropped.length} message(s); showing first ${summaryLines.length}]\n` +
      summaryLines.join("\n");
  }

  const summaryMsg: Message = {
    id: `compact-${dropped[0]?.id ?? "head"}`,
    role: "user",
    content: summaryContent.slice(0, 12_000),
    timestamp: dropped[0]?.timestamp ?? new Date(),
  };

  const out = [...head, summaryMsg, ...recent];
  if (estimateConversationTokens(out) <= maxTokens) return out;

  // Last resort: keep only recent (plus tiny note).
  const note: Message = {
    ...summaryMsg,
    content: `[Earlier conversation truncated: ${dropped.length + head.length} older message(s) omitted to fit context.]`,
  };
  return [note, ...recent];
}

/** Budget for chat messages given model context limit and system prompt size. */
export function messageTokenBudget(contextLimit: number, systemPromptChars: number): number {
  const systemTokens = estimateTokensFromText("x".repeat(Math.max(0, systemPromptChars)));
  const reserve = Math.max(1024, Math.floor(contextLimit * 0.2)); // completion + RAG headroom
  return Math.max(1024, contextLimit - systemTokens - reserve);
}
