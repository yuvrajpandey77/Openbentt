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
  | "openrouter"
  | "openai_direct"
  | "openai_compatible"
  | "anthropic"
  | "google";

/** How aggressively the client gathers Wikipedia / papers / URLs / Brave before the model runs. Not multi-agent Deep Research. */
export type ResearchDepth = "quick" | "standard" | "deep";

/** Extra system emphasis on step-by-step reasoning (all providers). Vendor-native “thinking” APIs vary; this is the portable layer. */
export type ReasoningPreference = "default" | "more";

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
}

export function defaultApiConfig(): ApiKeyConfig {
  return {
    aiProvider: "openrouter",
    apiKey: "",
    model: DEFAULT_MODEL_ID,
    customModelIds: [],
    comparisonEnabled: false,
    comparisonModelIds: [DEFAULT_MODEL_ID],
    researchEnabled: true,
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
  };
}

export function normalizeApiConfig(raw: Partial<ApiKeyConfig>): ApiKeyConfig {
  const base = defaultApiConfig();
  const allowed: AiProvider[] = [
    "openrouter",
    "openai_direct",
    "openai_compatible",
    "anthropic",
    "google",
  ];
  const aiProvider =
    typeof raw.aiProvider === "string" && allowed.includes(raw.aiProvider as AiProvider)
      ? (raw.aiProvider as AiProvider)
      : base.aiProvider;
  const rawModel = typeof raw.model === "string" && raw.model ? raw.model : base.model;
  const model = DEPRECATED_DEFAULT_MODEL_IDS.includes(rawModel) ? base.model : rawModel;
  const customModelIds = Array.isArray(raw.customModelIds)
    ? (raw.customModelIds as string[])
        .filter((s) => typeof s === "string" && s.trim())
        .map((s) => (s as string).trim())
    : base.customModelIds;
  const comparisonEnabled = typeof raw.comparisonEnabled === "boolean" ? raw.comparisonEnabled : base.comparisonEnabled;
  let comparisonModelIds = Array.isArray(raw.comparisonModelIds)
    ? (raw.comparisonModelIds as string[])
        .filter((s) => typeof s === "string" && s.trim())
        .map((s) => (s as string).trim())
    : base.comparisonModelIds;
  if (comparisonModelIds.length === 0) {
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
  };
}

export function dedupeModels(ids: string[]): string[] {
  return [...new Set(ids.map((s) => s.trim()).filter(Boolean))];
}

/** User can run chat for the selected provider (key and/or compatible base URL). */
export function canSendChat(cfg: ApiKeyConfig): boolean {
  switch (cfg.aiProvider) {
    case "openrouter":
    case "openai_direct":
    case "anthropic":
    case "google":
      return Boolean(cfg.apiKey?.trim());
    case "openai_compatible":
      return Boolean(cfg.openAiCompatibleBaseUrl?.trim());
    default:
      return false;
  }
}
