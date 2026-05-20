import { useQuery } from "@tanstack/react-query";
import { buildGgufModelId } from "@/lib/localGguf/ids";
import { getLocalGgufApi } from "@/lib/localGguf/desktopApi";
import type { OpenRouterModel } from "@/lib/openrouter";

/** Maps GGUF registry entries to picker rows (desktop only). */
export function useLocalGgufRegistryModels(enabled: boolean) {
  const api = typeof window !== "undefined" ? getLocalGgufApi() : undefined;
  return useQuery({
    queryKey: ["local-gguf-registry-models"],
    queryFn: async (): Promise<OpenRouterModel[]> => {
      const a = getLocalGgufApi();
      if (!a) return [];
      const { entries } = await a.listRegistry();
      return entries.map((e) => ({
        id: buildGgufModelId(e.id),
        name: e.displayName,
      }));
    },
    enabled: enabled && Boolean(api),
    staleTime: 30_000,
    retry: 1,
  });
}
