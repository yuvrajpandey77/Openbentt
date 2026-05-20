import type { ApiKeyConfig } from "@/types/chat";
import type { LocalModelDescriptor } from "@/lib/modelManager/types";
import {
  tierAtLeast,
  tierRank,
  EMBEDDING_MODEL_ID,
  defaultLightweightModelId,
} from "@/lib/modelManager/catalog";
import {
  type AvailabilityContext,
  isModelReady,
  isCloudAiProvider,
} from "@/lib/modelManager/availability";
import { profileForTask } from "@/lib/modelManager/profiles";
import type { ModelTask } from "./tasks";
import { TASK_MIN_TIER, TASK_PREFERRED_TIER } from "./tasks";

export class ModelRouteError extends Error {
  constructor(
    message: string,
    readonly code: "missing_model" | "offline_blocked" | "no_candidates" | "backend_unavailable",
    readonly task: ModelTask
  ) {
    super(message);
    this.name = "ModelRouteError";
  }
}

export interface ModelRoute {
  task: ModelTask;
  modelId: string;
  aiProvider: ApiKeyConfig["aiProvider"];
  backend: LocalModelDescriptor["backend"];
  /** Honest UI label — never a prompt persona. */
  displayLabel: string;
  /** Why this route was chosen. */
  reason: string;
}

function scoreCandidate(d: LocalModelDescriptor, task: ModelTask): number {
  const preferred = TASK_PREFERRED_TIER[task];
  const tierDelta = Math.abs(tierRank(d.tier) - tierRank(preferred));
  let score = tierDelta * 10;
  if (task === "embedding" && d.capabilities.includes("embedding")) score -= 50;
  if (task !== "embedding" && d.capabilities.includes("chat")) score -= 20;
  if (d.backend === "gguf") score -= 2;
  if (d.backend === "webgpu") score -= 1;
  if (d.performance.speedScore <= 2 && task === "chat_lightweight") score -= 5;
  if (d.performance.speedScore >= 4 && task === "chat_synthesis") score -= 3;
  return score;
}

function pickBest(
  candidates: LocalModelDescriptor[],
  task: ModelTask,
  ctx: AvailabilityContext
): LocalModelDescriptor | null {
  const minTier = TASK_MIN_TIER[task];
  const eligible = candidates.filter(
    (d) => tierAtLeast(d.tier, minTier) && isModelReady(d, ctx)
  );
  if (eligible.length === 0) return null;
  return eligible.sort((a, b) => scoreCandidate(a, task) - scoreCandidate(b, task))[0]!;
}

function routeFromDescriptor(d: LocalModelDescriptor, task: ModelTask, reason: string): ModelRoute {
  return {
    task,
    modelId: d.id,
    aiProvider: d.aiProvider,
    backend: d.backend,
    displayLabel: `${d.displayName} (${d.backend})`,
    reason,
  };
}

/**
 * Resolve the best local/cloud model for a workload task.
 * When local-only mode is set, cloud providers are excluded.
 */
export function routeModelForTask(
  task: ModelTask,
  cfg: ApiKeyConfig,
  candidates: LocalModelDescriptor[],
  ctx: AvailabilityContext
): ModelRoute {
  if (ctx.localOnlyMode && isCloudAiProvider(cfg.aiProvider) && task === "chat_general") {
    throw new ModelRouteError(
      "Local-only mode is on — cloud provider blocked. Switch to on-device or GGUF.",
      "offline_blocked",
      task
    );
  }

  if (task === "embedding") {
    const embed = candidates.find((c) => c.id === EMBEDDING_MODEL_ID);
    if (embed) {
      return routeFromDescriptor(embed, task, "Embeddings always use MiniLM-L6-v2 (not a chat LLM).");
    }
    return {
      task,
      modelId: EMBEDDING_MODEL_ID,
      aiProvider: "webgpu_gemma",
      backend: "webgpu",
      displayLabel: "MiniLM-L6-v2 (embeddings)",
      reason: "Fixed embedding pipeline.",
    };
  }

  const profile = profileForTask(task);

  if (task === "chat_general") {
    if (!ctx.localOnlyMode && isCloudAiProvider(cfg.aiProvider)) {
      return {
        task,
        modelId: cfg.model,
        aiProvider: cfg.aiProvider,
        backend: "cloud",
        displayLabel: `Cloud · ${cfg.model}`,
        reason: "Using your configured chat provider.",
      };
    }
  }

  const localOnly = ctx.localOnlyMode || task !== "chat_general";
  const pool = localOnly
    ? candidates.filter((c) => c.backend !== "cloud")
    : candidates;

  const best = pickBest(pool, task, ctx);
  if (best) {
    return routeFromDescriptor(
      best,
      task,
      `Routed to ${profile.name} profile (${profile.description}).`
    );
  }

  if (task === "chat_lightweight") {
    return {
      task,
      modelId: defaultLightweightModelId(),
      aiProvider: "webgpu_gemma",
      backend: "webgpu",
      displayLabel: "Qwen 0.5B (fallback lightweight)",
      reason: "No ready model matched; falling back to smallest on-device model.",
    };
  }

  if (ctx.localOnlyMode) {
    throw new ModelRouteError(
      `No local model ready for ${task}. Download a model in Local Models or enable on-device weights.`,
      "missing_model",
      task
    );
  }

  if (isCloudAiProvider(cfg.aiProvider) && cfg.aiProvider !== "openai_compatible" && cfg.apiKey.trim()) {
    return {
      task,
      modelId: cfg.model,
      aiProvider: cfg.aiProvider,
      backend: "cloud",
      displayLabel: `Cloud fallback · ${cfg.model}`,
      reason: "No suitable local model; using configured cloud provider.",
    };
  }

  throw new ModelRouteError(
    `No model available for ${task}. Check Local Models hub or API settings.`,
    "no_candidates",
    task
  );
}

/** Apply a route to a copy of config (for streaming). */
export function configForRoute(cfg: ApiKeyConfig, route: ModelRoute): ApiKeyConfig {
  if (route.backend === "ollama" && route.aiProvider === "openai_compatible") {
    return {
      ...cfg,
      aiProvider: "openai_compatible",
      model: route.modelId,
      openAiCompatibleBaseUrl: cfg.openAiCompatibleBaseUrl.trim() || "http://127.0.0.1:11434/v1",
    };
  }
  return {
    ...cfg,
    aiProvider: route.aiProvider,
    model: route.modelId,
  };
}
