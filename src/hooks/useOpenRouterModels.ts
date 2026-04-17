import { useQuery } from "@tanstack/react-query";
import type { AiProvider } from "@/types/chat";
import {
  ANTHROPIC_DEFAULT_MODELS,
  fetchGeminiModelsList,
  fetchOpenAiCompatibleModels,
  fetchOpenAiDirectModels,
  fetchOpenRouterModels,
  isLikelyFreeModel,
  OpenRouterModel,
  shortModelLabel,
} from "@/lib/openrouter";

export function useOpenRouterModels(
  apiKey: string,
  openAiCompatibleBaseUrl: string | undefined,
  aiProvider: AiProvider
) {
  const compat = openAiCompatibleBaseUrl?.trim();
  return useQuery({
    queryKey: ["chat-models", aiProvider, compat || "", apiKey],
    queryFn: async () => {
      switch (aiProvider) {
        case "openrouter":
          return fetchOpenRouterModels(apiKey);
        case "openai_direct":
          return fetchOpenAiDirectModels(apiKey);
        case "openai_compatible":
          return fetchOpenAiCompatibleModels(compat!, apiKey);
        case "anthropic":
          return ANTHROPIC_DEFAULT_MODELS;
        case "google":
          return fetchGeminiModelsList(apiKey);
        default:
          return fetchOpenRouterModels(apiKey);
      }
    },
    enabled:
      aiProvider === "openai_compatible"
        ? Boolean(compat)
        : aiProvider === "anthropic"
          ? true
          : // `/models` on OpenRouter is public → always load so first-time users without a key see options.
            aiProvider === "openrouter"
            ? true
            : Boolean(apiKey?.trim()),
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
}

/** Models from provider directory, merged with custom IDs and current selection. */
export function buildSelectableModels(
  all: OpenRouterModel[] | undefined,
  customIds: string[],
  extraIds: string[],
  opts?: { includeAllFromApi?: boolean }
): OpenRouterModel[] {
  const map = new Map<string, OpenRouterModel>();
  if (all) {
    for (const m of all) {
      if (opts?.includeAllFromApi || isLikelyFreeModel(m)) {
        map.set(m.id, m);
      }
    }
  }
  const ensure = (id: string) => {
    const t = id.trim();
    if (!t) return;
    if (!map.has(t)) {
      map.set(t, { id: t, name: shortModelLabel(t) });
    }
  };
  for (const id of customIds) ensure(id);
  for (const id of extraIds) ensure(id);
  return [...map.values()].sort((a, b) => a.id.localeCompare(b.id));
}
