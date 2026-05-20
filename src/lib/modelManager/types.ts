import type { AiProvider } from "@/types/chat";

/** Runtime backend that actually executes inference. */
export type ModelBackend = "webgpu" | "gguf" | "ollama" | "llamacpp" | "cloud";

/** What the model is suitable for (routing hints). */
export type ModelCapability = "chat" | "embedding" | "code";

/** Relative size tier for routing lightweight vs synthesis workloads. */
export type ModelTier = "tiny" | "compact" | "small" | "medium" | "large";

export type ModelAvailabilityState =
  | "ready"
  | "downloadable"
  | "missing"
  | "backend_unavailable"
  | "blocked_offline";

export interface StorageEstimate {
  bytesOnDisk: number;
  /** Extra headroom recommended (weights + KV cache heuristic). */
  recommendedFreeBytes: number;
  vramGiBHint: number | null;
  ramGiBHint: number | null;
}

export interface PerformanceEstimate {
  /** Rough relative speed 1 (fastest) – 5 (slowest). */
  speedScore: number;
  /** Human label for UI. */
  speedLabel: "fast" | "balanced" | "slow" | "unknown";
  contextLength: number;
}

/** Unified descriptor for any model the app can route to. */
export interface LocalModelDescriptor {
  id: string;
  displayName: string;
  backend: ModelBackend;
  /** Provider enum when streaming through existing chat paths. */
  aiProvider: AiProvider;
  tier: ModelTier;
  capabilities: ModelCapability[];
  quantization: string | null;
  storage: StorageEstimate;
  performance: PerformanceEstimate;
  /** Honest subtitle — never conflate prompt personas with model ids. */
  subtitle: string;
  /** Registry revision / version when known (GGUF). */
  version: string | null;
}

export interface ModelAvailability {
  modelId: string;
  state: ModelAvailabilityState;
  message: string;
}

export interface ModelProfile {
  id: string;
  name: string;
  description: string;
  /** Preferred quantization for GGUF downloads in this profile. */
  preferredQuant: "Q4" | "Q5" | "Q8" | "F16";
  /** Task types this profile is tuned for. */
  tasks: import("@/lib/modelRouting/tasks").ModelTask[];
  tier: ModelTier;
}

export interface LocalModelRegistrySnapshot {
  webgpu: LocalModelDescriptor[];
  gguf: LocalModelDescriptor[];
  ollama: LocalModelDescriptor[];
  embedding: LocalModelDescriptor;
  totalStorageBytes: number;
  diskFreeBytes: number | null;
}
