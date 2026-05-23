import { isLocalGemmaModelId, LOCAL_TINY_MODEL_ID } from "@/lib/gemmaWebGpu/models";
import { getLocalGgufApi } from "@/lib/localGguf/desktopApi";
import { isCloudInferenceAllowed } from "@/lib/privacy/privacyPreferences";
import { GGUF_MODEL_NONE, parseGgufRegistryId } from "@/lib/localGguf/ids";
import { normalizeGgufMaxParamB } from "@/lib/localGguf/guardrails";
import { isDesktopApp } from "@/lib/isDesktopApp";

export type Role = "assistant" | "user" | "system";

/** Multimodal / PDF parts for user messages. */
export type MessageAttachment =
  | {
      id: string;
      kind: "image" | "audio" | "video_frame";
      mediaType: string;
      name: string;
      dataUrl: string;
    }
  | {
      id: string;
      kind: "pdf";
      name: string;
      /** Extracted plaintext (chunked); not shown as image. */
      extractedText: string;
    };

export type ResearchSourceKind =
  | "web"
  | "wiki"
  | "paper"
  | "arxiv"
  | "semantic_scholar"
  | "dataset"
  | "other";

export interface ResearchSourceRef {
  title: string;
  url?: string;
  snippet: string;
  kind?: ResearchSourceKind;
  /** External id (arXiv id, S2 paperId, etc.) */
  id?: string;
  doi?: string;
}

export interface AgentTraceStep {
  step: string;
  detail: string;
}

export interface ResponseMetrics {
  ttftMs: number | null;
  totalMs: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface ComparisonResponse {
  id: string;
  model: string;
  content: string;
  metrics?: ResponseMetrics;
  error?: string;
  streaming?: boolean;
}

export interface Message {
  id: string;
  role: Role;
  content: string;
  timestamp: Date;
  attachments?: MessageAttachment[];
  /** Single-model assistant reply */
  metrics?: ResponseMetrics;
  comparisonResponses?: ComparisonResponse[];
  /** Populated when research gathered context for this turn */
  researchSources?: ResearchSourceRef[];
  /** Pipeline steps (research, tools) for advanced users */
  agentTrace?: AgentTraceStep[];
}

export interface Chat {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Current recommended free default. Llama 3.3 70B Instruct (free tier) is widely available on
 * OpenRouter today and handles general chat, code, and research prompts reasonably.
 * `DEPRECATED_DEFAULT_MODEL_IDS` migrates users off ids that OpenRouter no longer serves.
 */
export const DEFAULT_MODEL_ID = "meta-llama/llama-3.3-70b-instruct:free";

/** Old app defaults that OpenRouter removed; `normalizeApiConfig` bumps them to the current default. */
export const DEPRECATED_DEFAULT_MODEL_IDS: readonly string[] = [
  "mistralai/mistral-small-3.2-24b-instruct:free",
  "mistralai/mistral-7b-instruct:free",
];

/** Where API calls are routed. OpenRouter aggregates many vendors with one key; others use vendor keys or compatible bases. */
export type AiProvider =
  | "webgpu_gemma"
  | "local_gguf"
  | "openrouter"
  | "openai_direct"
  | "openai_compatible"
  | "anthropic"
  | "google";

/** How aggressively the client gathers Wikipedia / papers / URLs / Brave before the model runs. Not multi-agent Deep Research. */
export type ResearchDepth = "quick" | "standard" | "deep";

/** Extra system emphasis on step-by-step reasoning (all providers). Vendor-native “thinking” APIs vary; this is the portable layer. */
export type ReasoningPreference = "default" | "more";

/**
 * On-device (WebGPU / WASM) resource profile. Eco limits tokens and context to reduce RAM/VRAM use;
 * performance matches model defaults and keeps more history in the prompt.
 */
export type LocalInferenceProfile = "eco" | "balanced" | "performance";

export interface ApiKeyConfig {
  aiProvider: AiProvider;
  /** API key (OpenRouter, OpenAI, Anthropic, Google AI Studio, xAI, Moonshot, etc. depending on provider). */
  apiKey: string;
  model: string;
  customModelIds: string[];
  comparisonEnabled: boolean;
  comparisonModelIds: string[];
  /** Fetch Wikipedia + URLs + optional Brave; inject context (not persisted in chat text). */
  researchEnabled: boolean;
  /** Volume of fetched context when research is on (see Capabilities for honest limits vs hosted “deep research”). */
  researchDepth: ResearchDepth;
  /** Stronger reasoning instructions in system prompts (portable; not a separate model endpoint). */
  reasoningPreference: ReasoningPreference;
  /** Brave Search API key (client-side; visible in DevTools). Optional. */
  braveSearchApiKey: string;
  /**
   * Optional HTTPS base URL for a future server proxy, e.g. `https://your.app/api/research`.
   * POST JSON `{ query, urls }` → `{ context, sources }`.
   */
  researchProxyUrl: string;
  /**
   * Comma-separated hostnames allowed for server deep-research extra fetches (e.g. `arxiv.org,wikipedia.org`).
   * Only used when research proxy supports `deepResearch` in POST body.
   */
  researchApprovedDomains: string;
  /** Stronger math reasoning prompt + step-by-step bias */
  mathModeEnabled: boolean;
  /** Debugging / code assistance system prompt */
  debugModeEnabled: boolean;
  /**
   * OpenAI-compatible API base, e.g. `http://127.0.0.1:11434/v1` (Ollama) or LM Studio.
   * Empty = use OpenRouter only (`openrouter.ai`).
   */
  openAiCompatibleBaseUrl: string;
  /** Jailbreak / safety evaluation preset (red-team harness). */
  redTeamModeEnabled: boolean;
  /** Show collapsible research/tool trace on assistant messages */
  showAgentTraces: boolean;
  /** WebGPU / WASM: lower = less RAM, smaller effective context and max output unless you choose Performance. */
  localInferenceProfile: LocalInferenceProfile;
  /** If true, research can run while using the on-device model (uses network; context is still built client-side). */
  researchWithLocalModel: boolean;
  /**
   * Desktop GGUF: optional path to `llama-server` when not on PATH / bundled.
   * Empty = auto-detect (PATH, OPENBENTT_LLAMA_SERVER_PATH, resources/llama).
   */
  localGgufBinaryPath: string;
  /** Hugging Face token for gated / rate-limited GGUF downloads (stored locally in the app). */
  huggingFaceToken: string;
  /** Desktop GGUF safety: max parameter count (billions) allowed for downloads — 8 default, 16 advanced. */
  localGgufMaxParamB: 8 | 16;
  /** User confirmed multi-GB local weight downloads (GGUF hub). */
  localGgufDownloadConsent: boolean;
}

export function defaultApiConfig(): ApiKeyConfig {
  const desktop = typeof window !== "undefined" && isDesktopApp();
  return {
    aiProvider: desktop ? "openrouter" : "webgpu_gemma",
    apiKey: "",
    model: desktop ? DEFAULT_MODEL_ID : LOCAL_TINY_MODEL_ID,
    customModelIds: [],
    comparisonEnabled: false,
    comparisonModelIds: desktop ? [DEFAULT_MODEL_ID] : [LOCAL_TINY_MODEL_ID],
    researchEnabled: false,
    researchDepth: "standard",
    reasoningPreference: "default",
    braveSearchApiKey: "",
    researchProxyUrl: "",
    researchApprovedDomains: "",
    mathModeEnabled: false,
    debugModeEnabled: false,
    openAiCompatibleBaseUrl: "",
    redTeamModeEnabled: false,
    showAgentTraces: false,
    localInferenceProfile: "eco",
    researchWithLocalModel: true,
    localGgufBinaryPath: "",
    huggingFaceToken: "",
    localGgufMaxParamB: 8,
    localGgufDownloadConsent: false,
  };
}

export function normalizeApiConfig(raw: Partial<ApiKeyConfig>): ApiKeyConfig {
  const base = defaultApiConfig();
  const allowed: AiProvider[] = [
    "webgpu_gemma",
    "local_gguf",
    "openrouter",
    "openai_direct",
    "openai_compatible",
    "anthropic",
    "google",
  ];
  const rawProvider = typeof raw.aiProvider === "string" ? raw.aiProvider.trim() : "";
  const aiProvider: AiProvider =
    rawProvider && allowed.includes(rawProvider as AiProvider)
      ? (rawProvider as AiProvider)
      : typeof raw.model === "string" && raw.model.trim() && isLocalGemmaModelId(raw.model.trim())
        ? "webgpu_gemma"
        : typeof raw.openAiCompatibleBaseUrl === "string" && raw.openAiCompatibleBaseUrl.trim()
          ? "openai_compatible"
          : typeof raw.model === "string" &&
              raw.model.trim() &&
              raw.model.includes("/") &&
              !raw.model.trim().startsWith("openbentt/")
            ? "openrouter"
            : base.aiProvider;

  const defaultModelForProvider = (p: AiProvider): string =>
    p === "webgpu_gemma" ? LOCAL_TINY_MODEL_ID : p === "local_gguf" ? GGUF_MODEL_NONE : DEFAULT_MODEL_ID;

  const rawModel =
    typeof raw.model === "string" && raw.model.trim() ? raw.model.trim() : defaultModelForProvider(aiProvider);

  let model = rawModel;
  if (aiProvider === "webgpu_gemma") {
    if (!isLocalGemmaModelId(model)) {
      model = LOCAL_TINY_MODEL_ID;
    }
  } else if (aiProvider === "local_gguf") {
    if (!parseGgufRegistryId(model)) {
      model = GGUF_MODEL_NONE;
    }
  } else if (DEPRECATED_DEFAULT_MODEL_IDS.includes(rawModel)) {
    model = DEFAULT_MODEL_ID;
  }
  const customModelIds = Array.isArray(raw.customModelIds)
    ? (raw.customModelIds as string[])
        .filter((s) => typeof s === "string" && s.trim())
        .map((s) => (s as string).trim())
    : base.customModelIds;
  let comparisonEnabled = typeof raw.comparisonEnabled === "boolean" ? raw.comparisonEnabled : base.comparisonEnabled;
  let comparisonModelIds = Array.isArray(raw.comparisonModelIds)
    ? (raw.comparisonModelIds as string[])
        .filter((s) => typeof s === "string" && s.trim())
        .map((s) => (s as string).trim())
    : base.comparisonModelIds;
  if (comparisonModelIds.length === 0) {
    comparisonModelIds = [model];
  }
  if (aiProvider === "webgpu_gemma" || aiProvider === "local_gguf") {
    comparisonEnabled = false;
    comparisonModelIds = [model];
  }
  const researchEnabled =
    typeof raw.researchEnabled === "boolean" ? raw.researchEnabled : base.researchEnabled;
  const researchDepthRaw = raw.researchDepth;
  const researchDepth: ResearchDepth =
    researchDepthRaw === "quick" || researchDepthRaw === "standard" || researchDepthRaw === "deep"
      ? researchDepthRaw
      : base.researchDepth;
  const reasoningRaw = raw.reasoningPreference;
  const reasoningPreference: ReasoningPreference =
    reasoningRaw === "more" || reasoningRaw === "default" ? reasoningRaw : base.reasoningPreference;
  const braveSearchApiKey =
    typeof raw.braveSearchApiKey === "string" ? raw.braveSearchApiKey.trim() : base.braveSearchApiKey;
  const researchProxyUrl =
    typeof raw.researchProxyUrl === "string" ? raw.researchProxyUrl.trim() : base.researchProxyUrl;
  const researchApprovedDomains =
    typeof raw.researchApprovedDomains === "string" ? raw.researchApprovedDomains.trim() : base.researchApprovedDomains;
  const mathModeEnabled =
    typeof raw.mathModeEnabled === "boolean" ? raw.mathModeEnabled : base.mathModeEnabled;
  const debugModeEnabled =
    typeof raw.debugModeEnabled === "boolean" ? raw.debugModeEnabled : base.debugModeEnabled;
  const openAiCompatibleBaseUrl =
    typeof raw.openAiCompatibleBaseUrl === "string" ? raw.openAiCompatibleBaseUrl.trim() : base.openAiCompatibleBaseUrl;
  const redTeamModeEnabled =
    typeof raw.redTeamModeEnabled === "boolean" ? raw.redTeamModeEnabled : base.redTeamModeEnabled;
  const showAgentTraces =
    typeof raw.showAgentTraces === "boolean" ? raw.showAgentTraces : base.showAgentTraces;
  const localProfileRaw = raw.localInferenceProfile;
  const localInferenceProfile: LocalInferenceProfile =
    localProfileRaw === "eco" || localProfileRaw === "balanced" || localProfileRaw === "performance"
      ? localProfileRaw
      : base.localInferenceProfile;
  const researchWithLocalModel =
    typeof raw.researchWithLocalModel === "boolean" ? raw.researchWithLocalModel : base.researchWithLocalModel;
  const localGgufBinaryPath =
    typeof raw.localGgufBinaryPath === "string" ? raw.localGgufBinaryPath.trim() : base.localGgufBinaryPath;
  const huggingFaceToken =
    typeof raw.huggingFaceToken === "string" ? raw.huggingFaceToken.trim() : base.huggingFaceToken;
  const localGgufMaxParamB = normalizeGgufMaxParamB(
    raw.localGgufMaxParamB ?? base.localGgufMaxParamB
  );
  const localGgufDownloadConsent =
    typeof raw.localGgufDownloadConsent === "boolean"
      ? raw.localGgufDownloadConsent
      : base.localGgufDownloadConsent;

  return {
    aiProvider,
    apiKey: typeof raw.apiKey === "string" ? raw.apiKey : base.apiKey,
    model,
    customModelIds,
    comparisonEnabled,
    comparisonModelIds: dedupeModels(comparisonModelIds).slice(0, 4),
    researchEnabled,
    researchDepth,
    reasoningPreference,
    braveSearchApiKey,
    researchProxyUrl,
    researchApprovedDomains,
    mathModeEnabled,
    debugModeEnabled,
    openAiCompatibleBaseUrl,
    redTeamModeEnabled,
    showAgentTraces,
    localInferenceProfile,
    researchWithLocalModel,
    localGgufBinaryPath,
    huggingFaceToken,
    localGgufMaxParamB,
    localGgufDownloadConsent,
  };
}

export function dedupeModels(ids: string[]): string[] {
  return [...new Set(ids.map((s) => s.trim()).filter(Boolean))];
}

/** User can run chat for the selected provider (key and/or compatible base URL). */
export function canSendChat(cfg: ApiKeyConfig): boolean {
  switch (cfg.aiProvider) {
    case "webgpu_gemma":
      /** WASM (CPU) fallback keeps on-device Gemma usable even when WebGPU is missing. */
      return typeof navigator !== "undefined";
    case "local_gguf":
      /** Desktop shell only; model can be picked after entering the app (Labs → hub). */
      return typeof navigator !== "undefined" && Boolean(getLocalGgufApi());
    case "openrouter":
    case "openai_direct":
    case "anthropic":
    case "google":
      if (!isCloudInferenceAllowed(cfg.aiProvider, cfg.openAiCompatibleBaseUrl)) return false;
      return Boolean(cfg.apiKey?.trim());
    case "openai_compatible":
      if (!cfg.openAiCompatibleBaseUrl?.trim()) return false;
      return isCloudInferenceAllowed(cfg.aiProvider, cfg.openAiCompatibleBaseUrl);
    default:
      return false;
  }
}

/** Provider configured and ready to send a message (stricter than {@link canSendChat}). */
export function canSendMessage(cfg: ApiKeyConfig): boolean {
  if (!canSendChat(cfg)) return false;
  if (cfg.aiProvider === "local_gguf" && !parseGgufRegistryId(cfg.model)) return false;
  return true;
}
