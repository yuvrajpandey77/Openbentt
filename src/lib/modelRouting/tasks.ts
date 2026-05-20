/**
 * Task kinds used by smart routing — each maps to a size/backend preference.
 * These are workload labels, not model names or prompt personas.
 */
export type ModelTask =
  | "chat_general"
  | "chat_lightweight"
  | "chat_drafting"
  | "chat_synthesis"
  | "embedding"
  | "code_assist";

export const MODEL_TASK_LABELS: Record<ModelTask, string> = {
  chat_general: "General chat",
  chat_lightweight: "Lightweight (quick replies, titles, summaries)",
  chat_drafting: "Drafting (sections, outlines, rewrites)",
  chat_synthesis: "Synthesis (cross-paper, long-form)",
  embedding: "Embeddings (similarity search)",
  code_assist: "Code assistance",
};

/** Minimum tier per task (inclusive — model tier must be >= this). */
export const TASK_MIN_TIER: Record<
  ModelTask,
  import("@/lib/modelManager/types").ModelTier
> = {
  chat_general: "tiny",
  chat_lightweight: "tiny",
  chat_drafting: "compact",
  chat_synthesis: "small",
  embedding: "tiny",
  code_assist: "compact",
};

/** Preferred tier per task when multiple models are available. */
export const TASK_PREFERRED_TIER: Record<
  ModelTask,
  import("@/lib/modelManager/types").ModelTier
> = {
  chat_general: "small",
  chat_lightweight: "tiny",
  chat_drafting: "small",
  chat_synthesis: "medium",
  embedding: "tiny",
  code_assist: "compact",
};
