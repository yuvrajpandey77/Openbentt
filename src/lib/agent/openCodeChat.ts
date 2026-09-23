/**
 * OpenCode as the universal AI layer.
 *
 * Every request — build, plan, or ask — goes through OpenCode on desktop:
 * - Execution-class turns become OpenCode tasks (createTask/startTask).
 * - Conversational ("ask") turns stream through the local OmniRoute
 *   gateway (OpenAI-compatible) with the selected OpenCode model.
 *
 * Either way the user needs NO keys, NO provider maze (no OpenRouter key,
 * no local/gguf/webgpu selection) in chat. Model selection in every chat
 * panel is the OpenCode model list (free models first).
 *
 * Web fallback (no desktop bridge): the legacy provider pipeline owns the
 * turn and its key requirements still apply.
 */
import { hasOpenCodeDesktopApi, openCodeAgentApi } from "./openCodeAgentApi";
import type { CombinedAgentStatus, RuntimeModel } from "./openCodeTypes";
import { normalizeApiConfig, type ApiKeyConfig } from "@/types/chat";
import { buildChatCompletionMessages } from "@/lib/openrouter";
import { streamChatForConfig } from "@/lib/aiStream";
import type { Message } from "@/types/chat";

export const OPENCODE_MODEL_KEY = "openbentt-opencode-model";

export interface OpenCodeLayerSnapshot {
  available: boolean;
  checking: boolean;
  baseUrl: string | null;
  models: RuntimeModel[];
  status: CombinedAgentStatus | null;
  /** Real binary present: ask-turns run via `opencode run` (no gateway needed). */
  askReady: boolean;
  opencodeInstalled: boolean;
  opencodeVersion?: string;
}

/** Heuristic: gateway ids carrying a free tier marker come first. */
export function isFreeOpenCodeModel(m: Pick<RuntimeModel, "id" | "displayName">): boolean {
  const hay = `${m.id ?? ""} ${m.displayName ?? ""}`.toLowerCase();
  return hay.includes(":free") || hay.includes("free") || hay.includes("zen");
}

export function sortOpenCodeModels(models: RuntimeModel[]): RuntimeModel[] {
  return [...models].sort((a, b) => {
    const fa = isFreeOpenCodeModel(a) ? 0 : 1;
    const fb = isFreeOpenCodeModel(b) ? 0 : 1;
    if (fa !== fb) return fa - fb;
    return String(a.displayName ?? a.id).localeCompare(String(b.displayName ?? b.id));
  });
}

export function defaultOpenCodeModel(models: RuntimeModel[]): string {
  const sorted = sortOpenCodeModels(models.filter((m) => m.available !== false));
  return sorted[0]?.id ?? models[0]?.id ?? "auto";
}

export function loadStoredOpenCodeModel(): string | null {
  try {
    const v = localStorage.getItem(OPENCODE_MODEL_KEY);
    return v?.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

export function storeOpenCodeModel(id: string): void {
  try {
    localStorage.setItem(OPENCODE_MODEL_KEY, id);
  } catch {
    /* ignore */
  }
}

export async function fetchOpenCodeLayer(): Promise<Omit<OpenCodeLayerSnapshot, "checking">> {
  const empty = {
    available: false,
    baseUrl: null,
    models: [] as RuntimeModel[],
    status: null as OpenCodeLayerSnapshot["status"],
    askReady: false,
    opencodeInstalled: false,
    opencodeVersion: undefined as string | undefined,
  };
  if (!hasOpenCodeDesktopApi()) return empty;
  // Binary detection first: `opencode run` answers ask-turns with no
  // gateway and no keys. This is the primary universal path.
  try {
    const det = await openCodeAgentApi.detectOpenCode();
    if (det.installed) {
      empty.opencodeInstalled = true;
      empty.askReady = true;
      empty.opencodeVersion = det.version;
    }
  } catch {
    /* detection failure is non-fatal */
  }
  try {
    const status = await openCodeAgentApi.getRuntimeStatus();
    const baseUrl = status.omniRoute.baseUrl?.trim() || null;
    empty.status = status;
    empty.baseUrl = baseUrl;
    let gatewayModels: RuntimeModel[] = [];
    try {
      const res = await openCodeAgentApi.getModels(false);
      gatewayModels = Array.isArray(res.models) ? res.models : [];
    } catch {
      gatewayModels = [];
    }
    // Picker source: gateway models when present, else the binary's own
    // (Zen) list. Merged by id, gateway first.
    let models = [...gatewayModels];
    if (models.length === 0 && empty.askReady) {
      try {
        const bin = await openCodeAgentApi.listOpenCodeModels();
        if (Array.isArray(bin.models)) models = bin.models;
      } catch {
        /* picker falls back to auto */
      }
    }
    empty.models = sortOpenCodeModels(models);
    const omniReady = status.omniRoute.status === "READY";
    // Usable when the binary answers (ask via `run`) and/or the gateway
    // streams — no user keys involved either way.
    empty.available = empty.askReady || (Boolean(baseUrl) && (omniReady || gatewayModels.length > 0));
    return empty;
  } catch {
    empty.available = empty.askReady;
    return empty;
  }
}

/**
 * Ask-turn through the real binary. Returns full text; the caller chunks
 * it into the bubble so streaming UX is preserved.
 */
export async function askOpenCodeLayer(args: {
  message: string;
  model?: string;
  workspaceRoot?: string;
  title?: string;
  sessionId?: string;
}): Promise<{
  text: string;
  model: string;
  durationMs: number;
  sessionId?: string;
  permissionRequests: string[];
}> {
  if (!hasOpenCodeDesktopApi()) throw new Error("OpenCode bridge unavailable (desktop only).");
  return openCodeAgentApi.askOpenCode({
    message: args.message,
    model: args.model?.trim() ? args.model.trim() : undefined,
    workspaceRoot: args.workspaceRoot?.trim() ? args.workspaceRoot.trim() : undefined,
    title: args.title,
    sessionId: args.sessionId,
  });
}

/**
 * Stream a conversational turn through the OpenCode layer (local gateway,
 * OpenAI-compatible transport). Same message shape + callbacks as the
 * legacy pipeline so markdown/streaming/metrics keep working.
 */
export async function streamOpenCodeLayerChat(args: {
  model: string;
  baseUrl: string;
  systemPrompts: string[];
  chatMessages: Message[];
  signal: AbortSignal;
  callbacks: { onDelta: (d: string) => void; onUsage?: (u: { prompt_tokens?: number }) => void };
}) {
  const cfg: ApiKeyConfig = normalizeApiConfig({
    aiProvider: "openai_compatible",
    apiKey: "",
    openAiCompatibleBaseUrl: args.baseUrl,
    model: args.model,
  } as Partial<ApiKeyConfig>);
  const apiMessages = buildChatCompletionMessages(args.systemPrompts, args.chatMessages);
  return streamChatForConfig(cfg, args.model, apiMessages, args.signal, args.callbacks);
}
