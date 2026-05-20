import type { ApiKeyConfig } from "@/types/chat";
import type { ModelTask } from "./tasks";
import { routeModelForTask, configForRoute, ModelRouteError, type ModelRoute } from "./router";
import {
  buildModelManagerSnapshot,
  listChatCandidates,
  type ModelManagerSnapshot,
} from "@/lib/modelManager";
import { assertChatProviderAllowed } from "@/lib/offline/mode";
import { streamChatForConfig } from "@/lib/aiStream";
import type { OpenRouterStreamCallbacks, StreamMetrics } from "@/lib/openrouter";

export type { ModelRoute, ModelRouteError };

export async function resolveTaskRoute(
  task: ModelTask,
  cfg: ApiKeyConfig,
  opts?: { navigatorOffline?: boolean; snapshot?: ModelManagerSnapshot }
): Promise<{ route: ModelRoute; snapshot: ModelManagerSnapshot }> {
  const snapshot =
    opts?.snapshot ??
    (await buildModelManagerSnapshot(cfg, { navigatorOffline: opts?.navigatorOffline }));
  const candidates = [
    ...listChatCandidates(snapshot),
    snapshot.registry.embedding,
  ];
  const route = routeModelForTask(task, cfg, candidates, snapshot.ctx);
  return { route, snapshot };
}

/**
 * Stream chat for a routed task — respects offline-first and picks model by workload.
 */
export async function streamRoutedTask(
  task: ModelTask,
  cfg: ApiKeyConfig,
  messages: Array<{ role: string; content: unknown }>,
  signal: AbortSignal,
  callbacks: OpenRouterStreamCallbacks,
  opts?: { navigatorOffline?: boolean }
): Promise<{ text: string; metrics: StreamMetrics; route: ModelRoute; rateLimitHeaders: Record<string, string> }> {
  const { route } = await resolveTaskRoute(task, cfg, opts);
  const routedCfg = configForRoute(cfg, route);

  assertChatProviderAllowed(routedCfg, opts?.navigatorOffline);

  if (routedCfg.aiProvider === "local_gguf") {
    const { streamLocalGgufChat } = await import("@/lib/localGguf/streamLocalGguf");
    const result = await streamLocalGgufChat(routedCfg, routedCfg.model, messages, signal, callbacks);
    return { ...result, route, rateLimitHeaders: result.rateLimitHeaders ?? {} };
  }

  if (routedCfg.aiProvider === "webgpu_gemma") {
    const { streamLocalGemmaChat } = await import("@/lib/gemmaWebGpu/streamLocalGemma");
    const result = await streamLocalGemmaChat(routedCfg, messages, signal, callbacks);
    return { ...result, route, rateLimitHeaders: {} };
  }

  const result = await streamChatForConfig(routedCfg, routedCfg.model, messages, signal, callbacks);
  return { ...result, route };
}

export function missingModelUserMessage(err: unknown, task: ModelTask): string {
  if (err instanceof ModelRouteError) {
    return err.message;
  }
  if (err instanceof Error && err.name === "OfflineBlockedError") {
    return err.message;
  }
  return `Could not run ${task}: ${err instanceof Error ? err.message : String(err)}`;
}
