/**
 * Phase 6 — Chat-turn driver (framework-free composition helpers).
 * ChatContext supplies message plumbing; this module owns the agent
 * protocol mapping: activity → AgentTraceStep, final → chunked deltas,
 * sources → ResearchSourceRef. No React, no storage access here.
 */
import type { AgentTraceStep, ResearchSourceRef } from "@/types/chat";
import type { AgentRunOutput } from "@/lib/agent/agentRuntime";

/** Map run steps to safe trace entries (activity labels only, never reasoning). */
export function agentStepsToTrace(output: AgentRunOutput): AgentTraceStep[] {
  return output.run.steps
    .filter((s) => s.kind !== "model_reasoning")
    .map((s) => ({
      step: s.kind,
      detail: [s.label, s.toolId, s.decision, s.detail].filter(Boolean).join(" · ").slice(0, 200),
    }));
}

export function runOutputToSources(output: AgentRunOutput): ResearchSourceRef[] {
  return output.sources.slice(0, 12).map((s) => ({
    title: s.title,
    url: s.url,
    snippet: (s.snippet ?? "").slice(0, 300),
    id: s.id,
    kind: "other" as const,
  }));
}

/** Emit final text progressively (responsive progress, no second model call). */
export async function streamTextChunked(
  text: string,
  onDelta: (chunk: string) => void,
  signal?: AbortSignal,
  chunkSize = 64
): Promise<void> {
  for (let i = 0; i < text.length; i += chunkSize) {
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    onDelta(text.slice(i, i + chunkSize));
    await new Promise((r) => setTimeout(r, 0));
  }
}

/** Confirmation prompt text for a suspended run (safe metadata only). */
export function confirmationPromptFor(output: AgentRunOutput): string | null {
  const pending = output.run.pendingConfirmation;
  if (output.run.status !== "awaiting_confirmation" || !pending) return null;
  return `Agent requests confirmation — ${pending.summary}`;
}
