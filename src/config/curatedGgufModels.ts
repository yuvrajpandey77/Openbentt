/**
 * Curated GGUF models — safe defaults for Local model hub (Recommended tab).
 * All entries should be ≤8B unless tagged for 16B policy only.
 */

export type CuratedGgufTier = "starter" | "standard";

export interface CuratedGgufModel {
  id: string;
  repoId: string;
  fileName: string;
  /** Billions of parameters (for guardrails display). */
  paramB: number;
  tier: CuratedGgufTier;
  blurb: string;
  /** If true, only shown when user policy allows 16B. */
  requires16BPolicy?: boolean;
}

export const CURATED_GGUF_MODELS: readonly CuratedGgufModel[] = [
  {
    id: "qwen-0.5b",
    repoId: "Qwen/Qwen2.5-0.5B-Instruct-GGUF",
    fileName: "qwen2.5-0.5b-instruct-q4_k_m.gguf",
    paramB: 0.5,
    tier: "starter",
    blurb: "Tiny — runs on almost any CPU; good for smoke tests.",
  },
  {
    id: "llama-3.2-1b",
    repoId: "bartowski/Llama-3.2-1B-Instruct-GGUF",
    fileName: "Llama-3.2-1B-Instruct-Q4_K_M.gguf",
    paramB: 1,
    tier: "starter",
    blurb: "Very small Llama 3.2 — fast replies, low RAM.",
  },
  {
    id: "gemma-2-2b",
    repoId: "bartowski/gemma-2-2b-it-GGUF",
    fileName: "gemma-2-2b-it-Q4_K_M.gguf",
    paramB: 2,
    tier: "starter",
    blurb: "Google Gemma 2 2B — balanced for laptops.",
  },
  {
    id: "llama-3.2-3b",
    repoId: "bartowski/Llama-3.2-3B-Instruct-GGUF",
    fileName: "Llama-3.2-3B-Instruct-Q4_K_M.gguf",
    paramB: 3,
    tier: "standard",
    blurb: "Default-friendly 3B instruct model.",
  },
  {
    id: "phi-3-mini",
    repoId: "bartowski/Phi-3-mini-4k-instruct-GGUF",
    fileName: "Phi-3-mini-4k-instruct-Q4_K_M.gguf",
    paramB: 3.8,
    tier: "standard",
    blurb: "Microsoft Phi-3 mini — strong for size.",
  },
  {
    id: "qwen-1.5b",
    repoId: "Qwen/Qwen2.5-1.5B-Instruct-GGUF",
    fileName: "qwen2.5-1.5b-instruct-q4_k_m.gguf",
    paramB: 1.5,
    tier: "starter",
    blurb: "Compact Qwen 2.5 — code and chat.",
  },
  {
    id: "qwen-7b",
    repoId: "Qwen/Qwen2.5-7B-Instruct-GGUF",
    fileName: "qwen2.5-7b-instruct-q4_k_m.gguf",
    paramB: 7,
    tier: "standard",
    blurb: "7B — best quality within the 8B safety tier.",
  },
  {
    id: "llama-3.1-8b",
    repoId: "bartowski/Meta-Llama-3.1-8B-Instruct-GGUF",
    fileName: "Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf",
    paramB: 8,
    tier: "standard",
    blurb: "8B Llama 3.1 — upper bound for default policy.",
  },
  {
    id: "mistral-7b",
    repoId: "bartowski/Mistral-7B-Instruct-v0.3-GGUF",
    fileName: "Mistral-7B-Instruct-v0.3-Q4_K_M.gguf",
    paramB: 7,
    tier: "standard",
    blurb: "Mistral 7B v0.3 — popular instruct checkpoint.",
  },
] as const;

export function curatedModelsForPolicy(maxParamB: 8 | 16): CuratedGgufModel[] {
  return CURATED_GGUF_MODELS.filter((m) => m.paramB <= maxParamB && !m.requires16BPolicy);
}
