import type { ApiKeyConfig } from "@/types/chat";
import { getLocalGgufApi } from "@/lib/localGguf/desktopApi";
import {
  webgpuDescriptors,
  ggufDescriptors,
  ollamaDescriptors,
  embeddingDescriptor,
} from "./catalog";
import { buildStorageSummary, type StorageSummary } from "./storageEstimates";
import {
  buildAvailabilityContext,
  checkModelAvailability,
  type AvailabilityContext,
} from "./availability";
import { probeOllamaModels } from "./ollamaProbe";
import type { LocalModelDescriptor, LocalModelRegistrySnapshot, ModelAvailability } from "./types";
import { MODEL_PROFILES } from "./profiles";

export { MODEL_PROFILES } from "./profiles";
export * from "./types";
export * from "./catalog";
export * from "./availability";
export * from "./storageEstimates";
export * from "./ollamaProbe";

export interface ModelManagerSnapshot {
  registry: LocalModelRegistrySnapshot;
  availability: Map<string, ModelAvailability>;
  storage: StorageSummary;
  ollamaProbe: { ok: boolean; error?: string };
  ctx: AvailabilityContext;
}

async function loadGgufEntries() {
  const api = getLocalGgufApi();
  if (!api) return [];
  const { entries } = await api.listRegistry();
  return entries;
}

async function loadLlamaBinaryReady(cfg: ApiKeyConfig): Promise<boolean> {
  const api = getLocalGgufApi();
  if (!api) return false;
  const info = await api.resolveBinary(cfg.localGgufBinaryPath.trim() || undefined);
  return Boolean(info.path);
}

async function loadDiskFree(): Promise<number | null> {
  const api = getLocalGgufApi();
  if (!api) return null;
  const { bytes } = await api.diskFree();
  return bytes;
}

/**
 * Central model manager — aggregates catalogs, probes backends, and reports availability.
 */
export async function buildModelManagerSnapshot(
  cfg: ApiKeyConfig,
  opts?: { skipOllamaProbe?: boolean; navigatorOffline?: boolean }
): Promise<ModelManagerSnapshot> {
  const [ggufEntries, llamaReady, diskFree, ollamaResult] = await Promise.all([
    loadGgufEntries(),
    loadLlamaBinaryReady(cfg),
    loadDiskFree(),
    opts?.skipOllamaProbe || cfg.aiProvider !== "openai_compatible"
      ? Promise.resolve({ ok: false, baseUrl: "", modelIds: [] as string[], error: "skipped" })
      : probeOllamaModels(
          cfg.openAiCompatibleBaseUrl.trim() || undefined,
          opts?.navigatorOffline ? AbortSignal.abort() : undefined
        ).catch(() => ({ ok: false, baseUrl: "", modelIds: [] as string[], error: "probe failed" })),
  ]);

  const ctx = buildAvailabilityContext(cfg, {
    navigatorOffline: opts?.navigatorOffline,
    ggufRegistryIds: new Set(ggufEntries.map((e) => e.id)),
    ollamaModelIds: new Set(ollamaResult.modelIds),
    llamaBinaryReady: llamaReady,
  });

  const webgpu = webgpuDescriptors();
  const gguf = ggufDescriptors(ggufEntries);
  const ollama =
    ollamaResult.ok && ollamaResult.modelIds.length
      ? ollamaDescriptors(ollamaResult.modelIds, ollamaResult.baseUrl)
      : [];
  const embedding = embeddingDescriptor();

  const all = [...webgpu, ...gguf, ...ollama, embedding];
  const availability = new Map<string, ModelAvailability>();
  for (const d of all) {
    availability.set(d.id, checkModelAvailability(d, ctx));
  }

  const registry: LocalModelRegistrySnapshot = {
    webgpu,
    gguf,
    ollama,
    embedding,
    totalStorageBytes: gguf.reduce((a, g) => a + g.storage.bytesOnDisk, 0),
    diskFreeBytes: diskFree,
  };

  return {
    registry,
    availability,
    storage: buildStorageSummary([...webgpu, ...gguf], diskFree),
    ollamaProbe: { ok: ollamaResult.ok, error: ollamaResult.error },
    ctx,
  };
}

export function listChatCandidates(snapshot: ModelManagerSnapshot): LocalModelDescriptor[] {
  return [...snapshot.registry.webgpu, ...snapshot.registry.gguf, ...snapshot.registry.ollama].filter(
    (d) => d.capabilities.includes("chat") || d.capabilities.includes("code")
  );
}

export function formatModelRouteLabel(modelId: string, aiProvider: ApiKeyConfig["aiProvider"]): string {
  if (aiProvider === "webgpu_gemma") return `On-device · ${modelId.replace("openbentt/", "")}`;
  if (aiProvider === "local_gguf") return `GGUF · ${modelId.replace("openbentt/gguf:", "").slice(0, 8)}…`;
  if (aiProvider === "openai_compatible") return `Ollama/compatible · ${modelId}`;
  return `Cloud · ${modelId}`;
}
