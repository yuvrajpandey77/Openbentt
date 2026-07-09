import type { ApiKeyConfig } from "@/types/chat";
import { getLocalGgufApi } from "@/lib/localGguf/desktopApi";
import { parseGgufRegistryId } from "@/lib/localGguf/ids";
import { isLocalGemmaModelId } from "@/lib/gemmaWebGpu/models";
import { isLocalModelMarkedCached } from "@/lib/gemmaWebGpu/localModelCacheFlag";
import { loadPrivacyPreferences } from "@/lib/privacy/privacyPreferences";
import type { LocalModelDescriptor, ModelAvailability, ModelAvailabilityState } from "./types";
import { EMBEDDING_MODEL_ID } from "./catalog";

export interface AvailabilityContext {
  /** Privacy local-only mode — blocks cloud. */
  localOnlyMode: boolean;
  /** Browser reports offline. */
  navigatorOffline: boolean;
  /** GGUF registry ids currently on disk. */
  ggufRegistryIds: Set<string>;
  /** Ollama model ids from last probe. */
  ollamaModelIds: Set<string>;
  /** llama-server binary resolved. */
  llamaBinaryReady: boolean;
}

export function isCloudAiProvider(provider: ApiKeyConfig["aiProvider"]): boolean {
  return (
    provider === "openrouter" ||
    provider === "openai_direct" ||
    provider === "openai_compatible" ||
    provider === "anthropic" ||
    provider === "google"
  );
}

export function isLocalAiProvider(provider: ApiKeyConfig["aiProvider"]): boolean {
  return provider === "webgpu_gemma" || provider === "local_gguf";
}

export function buildAvailabilityContext(
  _cfg: ApiKeyConfig,
  opts?: Partial<AvailabilityContext>
): AvailabilityContext {
  const prefs = loadPrivacyPreferences();
  return {
    localOnlyMode: opts?.localOnlyMode ?? prefs.localOnlyMode,
    navigatorOffline: opts?.navigatorOffline ?? (typeof navigator !== "undefined" ? !navigator.onLine : false),
    ggufRegistryIds: opts?.ggufRegistryIds ?? new Set(),
    ollamaModelIds: opts?.ollamaModelIds ?? new Set(),
    llamaBinaryReady: opts?.llamaBinaryReady ?? false,
  };
}

function stateForDescriptor(
  d: LocalModelDescriptor,
  ctx: AvailabilityContext
): { state: ModelAvailabilityState; message: string } {
  if (d.id === EMBEDDING_MODEL_ID) {
    return { state: "ready", message: "Embedding model loads on first use (browser cache)." };
  }

  if (d.backend === "webgpu") {
    if (typeof navigator === "undefined") {
      return { state: "backend_unavailable", message: "Browser runtime required." };
    }
    if (isLocalModelMarkedCached(d.id)) {
      return {
        state: "ready",
        message: "Weights cached in this browser — loads from disk on first message this session.",
      };
    }
    return {
      state: "downloadable",
      message: "Weights download once, then cached for offline use.",
    };
  }

  if (d.backend === "gguf") {
    if (!getLocalGgufApi()) {
      return { state: "backend_unavailable", message: "Desktop app required for GGUF." };
    }
    if (!ctx.llamaBinaryReady) {
      return { state: "backend_unavailable", message: "llama-server binary not found." };
    }
    const regId = parseGgufRegistryId(d.id)?.registryId;
    if (regId && ctx.ggufRegistryIds.has(regId)) {
      return { state: "ready", message: "GGUF on disk; ready to load." };
    }
    return { state: "missing", message: "Download this model from Local Models hub." };
  }

  if (d.backend === "ollama") {
    if (ctx.localOnlyMode && ctx.navigatorOffline) {
      return { state: "blocked_offline", message: "Ollama probe skipped while offline." };
    }
    if (ctx.ollamaModelIds.has(d.id)) {
      return { state: "ready", message: "Ollama reports this model." };
    }
    return { state: "missing", message: "Pull model in Ollama: ollama pull " + d.id };
  }

  if (d.backend === "cloud") {
    if (ctx.localOnlyMode || ctx.navigatorOffline) {
      return { state: "blocked_offline", message: "Cloud blocked in local-only mode." };
    }
    return { state: "ready", message: "Cloud provider (requires API key)." };
  }

  return { state: "missing", message: "Unknown backend." };
}

export function checkModelAvailability(
  d: LocalModelDescriptor,
  ctx: AvailabilityContext
): ModelAvailability {
  const { state, message } = stateForDescriptor(d, ctx);
  return { modelId: d.id, state, message };
}

export function isModelReady(d: LocalModelDescriptor, ctx: AvailabilityContext): boolean {
  const { state } = stateForDescriptor(d, ctx);
  return state === "ready" || state === "downloadable";
}

/** Whether the user's current chat config can send right now. */
export function checkConfiguredModelAvailability(
  cfg: ApiKeyConfig,
  ctx: AvailabilityContext
): ModelAvailability {
  if (ctx.localOnlyMode && isCloudAiProvider(cfg.aiProvider)) {
    return {
      modelId: cfg.model,
      state: "blocked_offline",
      message: "Local-only mode is on — switch to a local provider.",
    };
  }

  if (cfg.aiProvider === "local_gguf") {
    const regId = parseGgufRegistryId(cfg.model)?.registryId;
    if (!regId) {
      return { modelId: cfg.model, state: "missing", message: "Pick a GGUF model in Local Models." };
    }
    if (!ctx.llamaBinaryReady) {
      return { modelId: cfg.model, state: "backend_unavailable", message: "llama-server not found." };
    }
    if (!ctx.ggufRegistryIds.has(regId)) {
      return { modelId: cfg.model, state: "missing", message: "Selected GGUF not on disk." };
    }
    return { modelId: cfg.model, state: "ready", message: "GGUF ready." };
  }

  if (cfg.aiProvider === "webgpu_gemma") {
    if (!isLocalGemmaModelId(cfg.model)) {
      return { modelId: cfg.model, state: "missing", message: "Invalid on-device model id." };
    }
    if (isLocalModelMarkedCached(cfg.model)) {
      return {
        modelId: cfg.model,
        state: "ready",
        message: "On-device model cached — ready (loads into RAM on first message).",
      };
    }
    return {
      modelId: cfg.model,
      state: "downloadable",
      message: "On-device model — downloads once, then cached in this browser.",
    };
  }

  if (isCloudAiProvider(cfg.aiProvider)) {
    if (ctx.localOnlyMode || ctx.navigatorOffline) {
      return {
        modelId: cfg.model,
        state: "blocked_offline",
        message: "Network unavailable or local-only mode blocks cloud.",
      };
    }
    if (cfg.aiProvider === "openai_compatible" && !cfg.openAiCompatibleBaseUrl.trim()) {
      return { modelId: cfg.model, state: "missing", message: "Set OpenAI-compatible base URL." };
    }
    if (cfg.aiProvider !== "openai_compatible" && !cfg.apiKey?.trim()) {
      return { modelId: cfg.model, state: "missing", message: "API key required." };
    }
    return { modelId: cfg.model, state: "ready", message: "Cloud provider configured." };
  }

  return { modelId: cfg.model, state: "missing", message: "Unknown provider." };
}
