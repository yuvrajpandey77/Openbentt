import type { OpenRouterModel } from "@/lib/openrouter";

/**
 * Local on-device models we support via `@huggingface/transformers`.
 *
 * `storedId` is what we persist in `ApiKeyConfig.model` when `aiProvider === "webgpu_gemma"`.
 * `hfRepo` is the upstream Hugging Face ONNX repo we download once and cache in the browser.
 *
 * We ship three tiers so the auto-picker can gracefully degrade on limited devices:
 *   - `medium` Gemma 4 E4B – best quality, needs ~2.5 GB GPU buffer.
 *   - `small`  Gemma 4 E2B – default; needs ~1.2 GB GPU buffer.
 *   - `tiny`   Qwen 2.5 0.5B – works on almost anything (CPU-only phones / integrated GPUs).
 */
export const LOCAL_GEMMA_MODEL_E2B = "openbentt/local-gemma-4-e2b";
export const LOCAL_GEMMA_MODEL_E4B = "openbentt/local-gemma-4-e4b";
export const LOCAL_TINY_MODEL_ID = "openbentt/local-qwen-0.5b";
export const LOCAL_COMPACT_QWEN_1_5B = "openbentt/local-qwen-1.5b";

export const DEFAULT_LOCAL_GEMMA_MODEL_ID = LOCAL_GEMMA_MODEL_E2B;
/** Lightest model we'll auto-switch to when the device can't run the user's choice. */
export const FALLBACK_TINY_LOCAL_MODEL_ID = LOCAL_TINY_MODEL_ID;

export const LOCAL_GEMMA_CONTEXT_LIMIT = 128_000;
/** Qwen 2.5 0.5B ships with a 32K context window. */
export const LOCAL_TINY_CONTEXT_LIMIT = 32_768;

/** Ordered from heaviest to lightest so cascade picks the smallest that still fits. */
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
 * Catalog is ordered heaviest → lightest. The picker walks this list when searching for a smaller
 * model the current device can handle on WebGPU.
 */
export const LOCAL_MODEL_CATALOG: readonly LocalModelEntry[] = [
  {
    storedId: LOCAL_GEMMA_MODEL_E4B,
    displayName: "Gemma 4 E4B (on-device · ~1.5GB download)",
    hfRepo: "onnx-community/gemma-4-E4B-it-ONNX",
    modelClass: "gemma4",
    size: "medium",
    contextLength: LOCAL_GEMMA_CONTEXT_LIMIT,
    gpuBufferBytesQ4: 2_500_000_000,
    gpuBufferBytesQ4f16: 2_200_000_000,
    wasmRamBytes: 3_500_000_000,
    defaultMaxTokens: 512,
    subtitle: "Highest quality, needs a strong GPU",
  },
  {
    storedId: LOCAL_GEMMA_MODEL_E2B,
    displayName: "Gemma 4 E2B (on-device · ~500MB download)",
    hfRepo: "onnx-community/gemma-4-E2B-it-ONNX",
    modelClass: "gemma4",
    size: "small",
    contextLength: LOCAL_GEMMA_CONTEXT_LIMIT,
    gpuBufferBytesQ4: 1_200_000_000,
    gpuBufferBytesQ4f16: 1_100_000_000,
    wasmRamBytes: 1_700_000_000,
    defaultMaxTokens: 768,
    subtitle: "Balanced default for most desktops",
  },
  {
    storedId: LOCAL_COMPACT_QWEN_1_5B,
    displayName: "Qwen 2.5 1.5B (compact · ~900MB download)",
    hfRepo: "onnx-community/Qwen2.5-1.5B-Instruct",
    modelClass: "causalLM",
    size: "compact",
    contextLength: LOCAL_TINY_CONTEXT_LIMIT,
    gpuBufferBytesQ4: 950_000_000,
    gpuBufferBytesQ4f16: 880_000_000,
    wasmRamBytes: 1_400_000_000,
    defaultMaxTokens: 768,
    subtitle: "Good for notebooks and code on mid-range GPUs",
  },
  {
    storedId: LOCAL_TINY_MODEL_ID,
    displayName: "Qwen 2.5 0.5B (tiny · ~400MB download)",
    hfRepo: "onnx-community/Qwen2.5-0.5B-Instruct",
    modelClass: "causalLM",
    size: "tiny",
    contextLength: LOCAL_TINY_CONTEXT_LIMIT,
    gpuBufferBytesQ4: 380_000_000,
    gpuBufferBytesQ4f16: 320_000_000,
    wasmRamBytes: 900_000_000,
    defaultMaxTokens: 1024,
    subtitle: "Fast, runs everywhere (phones, integrated GPUs, CPU)",
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
