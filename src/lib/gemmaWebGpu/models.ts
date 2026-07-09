import type { OpenRouterModel } from "@/lib/openrouter";

/**
 * Local on-device models via `@huggingface/transformers`.
 *
 * MVP / web /chat: only the smallest SLM is offered (Qwen 2.5 0.5B).
 * Larger Gemma/Qwen ids below are kept as deprecated constants so old
 * localStorage values normalize cleanly to the tiny model.
 *
 * `storedId` is what we persist in `ApiKeyConfig.model` when `aiProvider === "webgpu_gemma"`.
 * `hfRepo` is the upstream Hugging Face ONNX repo we download once and cache in the browser.
 */

/** @deprecated Not selectable; kept for migration of old configs. */
export const LOCAL_GEMMA_MODEL_E2B = "openbentt/local-gemma-4-e2b";
/** @deprecated Not selectable; kept for migration of old configs. */
export const LOCAL_GEMMA_MODEL_E4B = "openbentt/local-gemma-4-e4b";
export const LOCAL_TINY_MODEL_ID = "openbentt/local-qwen-0.5b";
/** @deprecated Not selectable; kept for migration of old configs. */
export const LOCAL_COMPACT_QWEN_1_5B = "openbentt/local-qwen-1.5b";

/** Only on-device chat model offered in Settings / composer. */
export const DEFAULT_LOCAL_GEMMA_MODEL_ID = LOCAL_TINY_MODEL_ID;
/** Lightest model — same as default while the catalog is tiny-only. */
export const FALLBACK_TINY_LOCAL_MODEL_ID = LOCAL_TINY_MODEL_ID;

export const LOCAL_GEMMA_CONTEXT_LIMIT = 128_000;
/** Qwen 2.5 0.5B ships with a 32K context window. */
export const LOCAL_TINY_CONTEXT_LIMIT = 32_768;

export type LocalModelSize = "medium" | "small" | "compact" | "tiny";

export interface LocalModelEntry {
  storedId: string;
  displayName: string;
  hfRepo: string;
  /** Loader selection inside `localGemmaInference.ts`. */
  modelClass: "gemma4" | "causalLM";
  size: LocalModelSize;
  contextLength: number;
  /** Approx largest single GPU buffer (embedding table) required by q4/q4f16 weights. */
  gpuBufferBytesQ4: number;
  gpuBufferBytesQ4f16: number;
  /** Rough CPU RAM working set for the fp16 WASM path. */
  wasmRamBytes: number;
  /** Generation default – smaller defaults keep CPU inference from feeling locked up. */
  defaultMaxTokens: number;
  /** Human-readable label shown in selectors. */
  subtitle: string;
}

/**
 * Selectable catalog — tiny only for reliable browser WebGPU / WASM testing.
 */
export const LOCAL_MODEL_CATALOG: readonly LocalModelEntry[] = [
  {
    storedId: LOCAL_TINY_MODEL_ID,
    displayName: "Qwen 2.5 0.5B (on-device · ~400MB)",
    hfRepo: "onnx-community/Qwen2.5-0.5B-Instruct",
    modelClass: "causalLM",
    size: "tiny",
    contextLength: LOCAL_TINY_CONTEXT_LIMIT,
    gpuBufferBytesQ4: 380_000_000,
    gpuBufferBytesQ4f16: 320_000_000,
    /** q8 WASM working set (fp16 was ~900MB and often hit ORT error 6 / bad_alloc). */
    wasmRamBytes: 450_000_000,
    /** Short replies keep WASM TTFT/total time usable on CPU. */
    defaultMaxTokens: 192,
    subtitle: "Smallest SLM — q8 on CPU in browser; WebGPU when stable",
  },
];

/** Display list used by ChatInput / ContextMeter / SettingsPanel dropdowns. */
export const LOCAL_GEMMA_SELECTABLE_MODELS: OpenRouterModel[] = LOCAL_MODEL_CATALOG.map((m) => ({
  id: m.storedId,
  name: m.displayName,
  context_length: m.contextLength,
}));

export function findLocalModelEntry(storedModelId: string): LocalModelEntry | null {
  return LOCAL_MODEL_CATALOG.find((m) => m.storedId === storedModelId) ?? null;
}

export function getLocalModelEntry(storedModelId: string): LocalModelEntry {
  return findLocalModelEntry(storedModelId) ?? findLocalModelEntry(LOCAL_TINY_MODEL_ID)!;
}

export function isLocalGemmaModelId(modelId: string): boolean {
  return findLocalModelEntry(modelId) !== null;
}

/** Legacy ids that used to be in the catalog; normalize to tiny. */
const LEGACY_LOCAL_MODEL_IDS = new Set([
  LOCAL_GEMMA_MODEL_E2B,
  LOCAL_GEMMA_MODEL_E4B,
  LOCAL_COMPACT_QWEN_1_5B,
]);

export function isLegacyLocalGemmaModelId(modelId: string): boolean {
  return LEGACY_LOCAL_MODEL_IDS.has(modelId);
}

/** @deprecated – prefer `getLocalModelEntry(storedId).hfRepo`. Kept for callers we haven't migrated yet. */
export function hfRepoIdForStoredModel(storedModelId: string): string {
  return getLocalModelEntry(storedModelId).hfRepo;
}

/** Catalog entries strictly smaller than `from`, lightest first (tiny → small). */
export function smallerLocalModelsThan(from: LocalModelEntry): LocalModelEntry[] {
  const order: Record<LocalModelSize, number> = { medium: 3, small: 2, compact: 1, tiny: 0 };
  return [...LOCAL_MODEL_CATALOG]
    .filter((m) => order[m.size] < order[from.size])
    .sort((a, b) => order[a.size] - order[b.size]);
}
