import React, { useMemo } from "react";
import { useChat } from "@/context/ChatContext";
import { useOpenRouterModels, buildSelectableModels } from "@/hooks/useOpenRouterModels";
import { useLocalGgufRegistryModels } from "@/hooks/useLocalGgufRegistryModels";
import {
  contextFillRatio,
  estimateTokensFromMessagesRough,
  resolveContextLimit,
} from "@/lib/contextMeter";
import { LOCAL_GEMMA_SELECTABLE_MODELS } from "@/lib/gemmaWebGpu/models";
import { cn } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";

/** Circular ring showing prompt tokens vs model context window (API usage when available, else estimate). */
export const ContextMeter: React.FC = () => {
  const { apiConfig, currentChatId, chats, isLoading, streamingPromptTokens, workspaceAssistTokenEstimate } =
    useChat();
  const { data: models } = useOpenRouterModels(
    apiConfig.apiKey,
    apiConfig.openAiCompatibleBaseUrl,
    apiConfig.aiProvider
  );
  const { data: ggufModels } = useLocalGgufRegistryModels(apiConfig.aiProvider === "local_gguf");

  const selectable = useMemo(
    () =>
      apiConfig.aiProvider === "webgpu_gemma"
        ? buildSelectableModels(LOCAL_GEMMA_SELECTABLE_MODELS, apiConfig.customModelIds, [
            apiConfig.model,
            ...apiConfig.comparisonModelIds,
          ], { includeAllFromApi: true })
        : apiConfig.aiProvider === "local_gguf"
          ? buildSelectableModels(ggufModels, apiConfig.customModelIds, [
              apiConfig.model,
              ...apiConfig.comparisonModelIds,
            ], { includeAllFromApi: true })
          : buildSelectableModels(
              models,
              apiConfig.customModelIds,
              [apiConfig.model, ...apiConfig.comparisonModelIds],
              { includeAllFromApi: apiConfig.aiProvider !== "openrouter" }
            ),
    [models, ggufModels, apiConfig.customModelIds, apiConfig.model, apiConfig.comparisonModelIds, apiConfig.aiProvider]
  );

  const meta = useMemo(
    () => selectable.find((m) => m.id === apiConfig.model),
    [selectable, apiConfig.model]
  );

  const messages = useMemo(() => {
    const c = chats.find((x) => x.id === currentChatId);
    return c?.messages ?? [];
  }, [chats, currentChatId]);

  const limit = useMemo(() => {
    const fromMeta = meta?.context_length;
    if (fromMeta && fromMeta > 0) return fromMeta;
    return resolveContextLimit(apiConfig.model, selectable.length ? selectable : models);
  }, [meta, apiConfig.model, selectable, models]);

  const lastAssistantUsage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]!;
      if (m.role === "assistant" && m.metrics?.promptTokens != null) {
        return m.metrics.promptTokens;
      }
    }
    return null;
  }, [messages]);

  const estimated = useMemo(() => estimateTokensFromMessagesRough(messages), [messages]);

  const messageTokens = useMemo(() => {
    if (isLoading && streamingPromptTokens != null) return streamingPromptTokens;
    if (lastAssistantUsage != null) return lastAssistantUsage;
    return estimated;
  }, [isLoading, streamingPromptTokens, lastAssistantUsage, estimated]);

  const used = messageTokens + workspaceAssistTokenEstimate;

  const ratio = contextFillRatio(used, limit);
  const pct = Math.round(ratio * 100);
  const warn = ratio >= 0.9;
  const source =
    isLoading && streamingPromptTokens != null
      ? "live"
      : lastAssistantUsage != null
        ? "api"
        : "estimate";

  const r = 18;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.min(1, ratio));

  const title = `Context window: ${used.toLocaleString()} / ${limit.toLocaleString()} tokens (${source}).${
    workspaceAssistTokenEstimate > 0
      ? ` Includes ~${workspaceAssistTokenEstimate.toLocaleString()} tok notebook workspace assist.`
      : ""
  } ${
    source === "estimate" ? "~4 chars/token heuristic; enable usage by using OpenRouter/OpenAI streaming with usage." : ""
  }${warn ? " — Near window limit; answers may truncate or drift." : ""}`;

  return (
    <div
      className="flex h-9 max-w-[min(240px,46vw)] items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-2"
      title={title}
    >
      <div className="relative h-9 w-9 shrink-0">
        <svg className="-rotate-90 transform" width="36" height="36" viewBox="0 0 44 44" aria-hidden>
          <circle cx="22" cy="22" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="4" opacity="0.35" />
          <circle
            cx="22"
            cy="22"
            r={r}
            fill="none"
            stroke={warn ? "hsl(var(--destructive))" : "hsl(var(--primary))"}
            strokeWidth="4"
            strokeDasharray={c}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className={cn("transition-[stroke-dashoffset] duration-300", isLoading && "animate-pulse")}
          />
        </svg>
        {isLoading && (
          <div
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
            aria-hidden
          >
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        )}
        {!isLoading && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[9px] font-semibold tabular-nums text-foreground">
            {pct}%
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1 text-left">
        <div className="flex items-center gap-1">
          <div className="text-[11px] font-medium leading-none text-foreground">Context</div>
          {warn && (
            <span
              className="inline-flex shrink-0 text-destructive"
              title="Near window limit — answers may truncate or drift."
            >
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
            </span>
          )}
        </div>
        <div className="truncate font-mono text-[10px] leading-tight text-muted-foreground">
          {used.toLocaleString()} / {limit.toLocaleString()} tok
          <span className="ml-1 text-[9px] uppercase opacity-70">
            {source === "api" ? "usage" : source === "live" ? "live" : "est."}
          </span>
        </div>
      </div>
    </div>
  );
};
