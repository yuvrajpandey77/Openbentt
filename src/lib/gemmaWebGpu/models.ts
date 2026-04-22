import type { OpenRouterModel } from "@/lib/openrouter";

/** Stored in `ApiKeyConfig.model` when `aiProvider === "webgpu_gemma"`. */
export const LOCAL_GEMMA_MODEL_E2B = "openbentt/local-gemma-4-e2b";
export const LOCAL_GEMMA_MODEL_E4B = "openbentt/local-gemma-4-e4b";

export const DEFAULT_LOCAL_GEMMA_MODEL_ID = LOCAL_GEMMA_MODEL_E2B;

export const LOCAL_GEMMA_CONTEXT_LIMIT = 128_000;

export const LOCAL_GEMMA_SELECTABLE_MODELS: OpenRouterModel[] = [
  {
    id: LOCAL_GEMMA_MODEL_E2B,
    name: "Gemma 4 E2B (on-device · ~500MB download)",
    context_length: LOCAL_GEMMA_CONTEXT_LIMIT,
  },
  {
    id: LOCAL_GEMMA_MODEL_E4B,
    name: "Gemma 4 E4B (on-device · ~1.5GB download)",
    context_length: LOCAL_GEMMA_CONTEXT_LIMIT,
  },
];

export function isLocalGemmaModelId(modelId: string): boolean {
  return modelId === LOCAL_GEMMA_MODEL_E2B || modelId === LOCAL_GEMMA_MODEL_E4B;
}

export function hfRepoIdForStoredModel(storedModelId: string): string {
  return storedModelId.includes("e4b")
    ? "onnx-community/gemma-4-E4B-it-ONNX"
    : "onnx-community/gemma-4-E2B-it-ONNX";
}
