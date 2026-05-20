import { LOCAL_MODEL_CATALOG, LOCAL_TINY_MODEL_ID } from "@/lib/gemmaWebGpu/models";
import { estimateMinVramGiBForWeights } from "@/lib/localGguf/ggufHints";
import type { LocalGgufRegistryEntry } from "@/lib/localGguf/desktopApi";
import { buildGgufModelId } from "@/lib/localGguf/ids";
import { parseParamBillions } from "@/lib/localGguf/guardrails";
import { guessQuantLabelFromGgufFileName } from "@/lib/localGguf/ggufHints";
import type { LocalModelDescriptor, ModelTier } from "./types";

const TIER_ORDER: Record<ModelTier, number> = {
  tiny: 0,
  compact: 1,
  small: 2,
  medium: 3,
  large: 4,
};

const SIZE_TO_TIER: Record<string, ModelTier> = {
  tiny: "tiny",
  compact: "compact",
  small: "small",
  medium: "medium",
};

export const EMBEDDING_MODEL_ID = "openbentt/embedding-minilm-l6-v2";

export function tierRank(t: ModelTier): number {
  return TIER_ORDER[t] ?? 0;
}

export function tierAtLeast(model: ModelTier, min: ModelTier): boolean {
  return tierRank(model) >= tierRank(min);
}

/** WebGPU / Transformers.js on-device chat models. */
export function webgpuDescriptors(): LocalModelDescriptor[] {
  return LOCAL_MODEL_CATALOG.map((m) => ({
    id: m.storedId,
    displayName: m.displayName,
    backend: "webgpu" as const,
    aiProvider: "webgpu_gemma" as const,
    tier: SIZE_TO_TIER[m.size] ?? "small",
    capabilities: ["chat", "code"] as const,
    quantization: "q4 (ONNX)",
    storage: {
      bytesOnDisk: m.wasmRamBytes,
      recommendedFreeBytes: Math.round(m.wasmRamBytes * 1.25),
      vramGiBHint: m.gpuBufferBytesQ4 / 1024 ** 3,
      ramGiBHint: m.wasmRamBytes / 1024 ** 3,
    },
    performance: {
      speedScore: m.size === "tiny" ? 1 : m.size === "compact" ? 2 : m.size === "small" ? 3 : 4,
      speedLabel:
        m.size === "tiny" ? "fast" : m.size === "compact" || m.size === "small" ? "balanced" : "slow",
      contextLength: m.contextLength,
    },
    subtitle: m.subtitle,
    version: null,
  }));
}

function ggufTierFromParams(paramB: number | null, fileBytes: number): ModelTier {
  if (paramB != null) {
    if (paramB <= 1) return "tiny";
    if (paramB <= 3) return "compact";
    if (paramB <= 8) return "small";
    if (paramB <= 16) return "medium";
    return "large";
  }
  const gib = fileBytes / 1024 ** 3;
  if (gib < 1) return "tiny";
  if (gib < 2.5) return "compact";
  if (gib < 6) return "small";
  if (gib < 12) return "medium";
  return "large";
}

/** GGUF registry entries → unified descriptors. */
export function ggufDescriptors(entries: LocalGgufRegistryEntry[]): LocalModelDescriptor[] {
  return entries.map((e) => {
    const paramB = parseParamBillions(e.fileName) ?? parseParamBillions(e.repoId);
    const quant = guessQuantLabelFromGgufFileName(e.fileName);
    const tier = ggufTierFromParams(paramB, e.bytes);
    const vram = estimateMinVramGiBForWeights(e.bytes);
    return {
      id: buildGgufModelId(e.id),
      displayName: e.displayName || e.fileName,
      backend: "gguf" as const,
      aiProvider: "local_gguf" as const,
      tier,
      capabilities: ["chat", "code"] as const,
      quantization: quant,
      storage: {
        bytesOnDisk: e.bytes,
        recommendedFreeBytes: Math.round(e.bytes * 1.35),
        vramGiBHint: vram,
        ramGiBHint: vram * 1.2,
      },
      performance: {
        speedScore: tier === "tiny" ? 2 : tier === "compact" ? 3 : tier === "small" ? 3 : 4,
        speedLabel: tier === "large" || tier === "medium" ? "slow" : "balanced",
        contextLength: 8192,
      },
      subtitle: `${e.repoId} · ${quant ?? "GGUF"} · rev ${e.revision}`,
      version: e.revision,
    };
  });
}

/** Ollama models discovered via OpenAI-compatible /v1/models. */
export function ollamaDescriptors(
  modelIds: string[],
  baseUrl: string
): LocalModelDescriptor[] {
  return modelIds.map((id) => {
    const lower = id.toLowerCase();
    let tier: ModelTier = "small";
    if (/embed|minilm|nomic-embed/.test(lower)) tier = "tiny";
    else if (/0\.5b|1b|1\.5b|2b|3b/.test(lower)) tier = "compact";
    else if (/7b|8b|9b/.test(lower)) tier = "small";
    else if (/13b|14b|20b|32b|34b/.test(lower)) tier = "medium";
    else if (/70b|72b|405b/.test(lower)) tier = "large";

    return {
      id,
      displayName: `Ollama · ${id}`,
      backend: "ollama" as const,
      aiProvider: "openai_compatible" as const,
      tier,
      capabilities: /embed/.test(lower) ? (["embedding"] as const) : (["chat", "code"] as const),
      quantization: null,
      storage: {
        bytesOnDisk: 0,
        recommendedFreeBytes: 0,
        vramGiBHint: null,
        ramGiBHint: null,
      },
      performance: {
        speedScore: tierRank(tier) + 1,
        speedLabel: tier === "tiny" || tier === "compact" ? "fast" : "balanced",
        contextLength: 8192,
      },
      subtitle: `Ollama @ ${baseUrl}`,
      version: null,
    };
  });
}

export function embeddingDescriptor(): LocalModelDescriptor {
  return {
    id: EMBEDDING_MODEL_ID,
    displayName: "MiniLM-L6-v2 (on-device embeddings)",
    backend: "webgpu" as const,
    aiProvider: "webgpu_gemma" as const,
    tier: "tiny",
    capabilities: ["embedding"],
    quantization: "q8",
    storage: {
      bytesOnDisk: 23_000_000,
      recommendedFreeBytes: 40_000_000,
      vramGiBHint: 0.3,
      ramGiBHint: 0.5,
    },
    performance: {
      speedScore: 1,
      speedLabel: "fast",
      contextLength: 512,
    },
    subtitle: "Transformers.js · Xenova/all-MiniLM-L6-v2 · not a chat LLM",
    version: null,
  };
}

export function defaultLightweightModelId(): string {
  return LOCAL_TINY_MODEL_ID;
}
