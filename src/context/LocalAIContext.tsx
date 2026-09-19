import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  getOllamaDesktopApi,
  type OllamaInstallInfo,
  type OllamaPullProgress,
  type OllamaStatus,
} from "@/lib/ollama/desktopApi";
import { probeOllamaModels } from "@/lib/modelManager/ollamaProbe";
import { autoSelectOllamaModel } from "@/lib/ollama/selection";
import { useTaskCenter } from "./TaskCenterContext";
import { useChat } from "./ChatContext";
import type { ApiKeyConfig } from "@/types/chat";

/**
 * Phase 9 — local AI (Ollama-first) orchestration.
 *
 * - Detection: real `ollama:status` IPC on desktop (native /api/tags,
 *   /api/version, /api/ps); renderer `/v1/models` probe fallback on web.
 * - Selection: explicit user preference wins; otherwise auto-discover.
 * - Downloads: real `/api/pull` streaming progress via IPC events,
 *   mirrored into the global TaskCenter. Never simulated.
 * - GGUF remains available as advanced config elsewhere; this context
 *   never presents a broken backend as ready.
 */

export type LocalAIHealth = "checking" | "ready" | "no-models" | "unavailable" | "unsupported";

export interface EffectiveModel {
  /** The model ID that will actually be used for generation. */
  modelId: string | null;
  /** Human-readable display name. */
  displayName: string;
  /** Provider type for badge/UI. */
  provider: "ollama" | "openai_compatible" | "cloud" | "webgpu" | "gguf" | null;
  /** Location for badge/UI. */
  location: "local" | "cloud" | null;
  /** Whether this model is currently available/ready. */
  available: boolean;
  /** Source of this model selection. */
  source: "explicit" | "auto" | "fallback" | "persisted";
}

interface LocalAIContextValue {
  health: LocalAIHealth;
  status: OllamaStatus | null;
  modelNames: string[];
  runningModels: string[];
  version: string | null;
  error: string | null;
  /** Effective default local model (preference > auto-discovered > null). */
  defaultModel: string | null;
  defaultReason: string;
  preferredModel: string | null;
  setPreferredModel: (name: string | null) => void;
  refresh: () => Promise<void>;
  pullModel: (model: string) => Promise<void>;
  cancelPull: (model: string) => Promise<void>;
  activePulls: Record<string, OllamaPullProgress>;
  installInfo: OllamaInstallInfo | null;
  recommendedModels: string[];
  checking: boolean;
  desktopAvailable: boolean;
  initialValidationDone: boolean;
  /** The model that will actually be used for generation right now. */
  effectiveModel: EffectiveModel | null;
}

const PREF_KEY = "openbentt-local-model-pref";

const LocalAIContext = createContext<LocalAIContextValue>({
  health: "checking",
  status: null,
  modelNames: [],
  runningModels: [],
  version: null,
  error: null,
  defaultModel: null,
  defaultReason: "no-usable-model",
  preferredModel: null,
  setPreferredModel: () => {},
  refresh: async () => {},
  pullModel: async () => {},
  cancelPull: async () => {},
  activePulls: {},
  installInfo: null,
  recommendedModels: [],
  checking: true,
  desktopAvailable: false,
  initialValidationDone: false,
  effectiveModel: null,
});

function loadPref(): string | null {
  try {
    return localStorage.getItem(PREF_KEY);
  } catch {
    return null;
  }
}

function buildEffectiveModel(
  apiConfig: ApiKeyConfig,
  localAI: {
    defaultModel: string | null;
    defaultReason: string;
    modelNames: string[];
    runningModels: string[];
    status: OllamaStatus | null;
    health: LocalAIHealth;
    preferredModel: string | null;
  },
  initialValidationDone: boolean
): EffectiveModel | null {
  const provider = apiConfig.aiProvider;
  const model = apiConfig.model;

  // Cloud providers
  if (["openrouter", "openai_direct", "anthropic", "google"].includes(provider)) {
    return {
      modelId: model || null,
      displayName: model || "Select model",
      provider: "cloud",
      location: "cloud",
      available: Boolean(model),
      source: "explicit",
    };
  }

  // OpenAI-compatible (Ollama, LM Studio, etc.)
  if (provider === "openai_compatible") {
    const isLocal = apiConfig.openAiCompatibleBaseUrl?.includes("127.0.0.1") ||
                    apiConfig.openAiCompatibleBaseUrl?.includes("localhost") ||
                    apiConfig.openAiCompatibleBaseUrl?.includes("[::1]");
    // If initial validation hasn't completed, don't mark local models as unavailable yet
    // They might just be waiting for the initial Ollama check to complete
    const effectiveAvailable = isLocal
      ? initialValidationDone ? (localAI.modelNames.includes(model) || localAI.runningModels?.includes(model)) : true // Before validation, assume available (will update after check)
      : true; // Remote compatible providers - trust the config
    return {
      modelId: model || null,
      displayName: model || "Select model",
      provider: "openai_compatible",
      location: isLocal ? "local" : "cloud",
      available: Boolean(model) && (isLocal ? effectiveAvailable : true),
      source: localAI.preferredModel === model ? "explicit" : localAI.defaultReason === "explicit-preference" ? "persisted" : "fallback",
    };
  }

  // WebGPU Gemma
  if (provider === "webgpu_gemma") {
    return {
      modelId: model || null,
      displayName: model || "On-device model",
      provider: "webgpu",
      location: "local",
      available: Boolean(model),
      source: "explicit",
    };
  }

  // GGUF
  if (provider === "local_gguf") {
    return {
      modelId: model || null,
      displayName: model || "GGUF model",
      provider: "gguf",
      location: "local",
      available: Boolean(model),
      source: "explicit",
    };
  }

  // No provider configured — fall back to local AI default
  if (localAI.defaultModel) {
    return {
      modelId: localAI.defaultModel,
      displayName: localAI.defaultModel,
      provider: "ollama",
      location: "local",
      available: localAI.health === "ready",
      source: localAI.defaultReason === "explicit-preference" ? "explicit" : "auto",
    };
  }

  return null;
}

export function LocalAIProvider({ children }: { children: React.ReactNode }) {
  const { upsertTask } = useTaskCenter();
  const { apiConfig } = useChat();
  const [status, setStatus] = useState<OllamaStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preferredModel, setPreferredModelState] = useState<string | null>(loadPref);
  const [activePulls, setActivePulls] = useState<Record<string, OllamaPullProgress>>({});
  const [installInfo, setInstallInfo] = useState<OllamaInstallInfo | null>(null);
  const [recommendedModels, setRecommendedModels] = useState<string[]>([]);
  const [initialValidationDone, setInitialValidationDone] = useState(false);
  const desktopAvailable = useMemo(() => getOllamaDesktopApi() != null, []);
  const pollRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    setChecking(true);
    try {
      const api = getOllamaDesktopApi();
      if (api) {
        const s = await api.status();
        setStatus(s);
        setError(s.reachable ? null : s.error ?? "Ollama is not reachable");
        try {
          setInstallInfo(await api.installInfo());
        } catch {
          /* optional */
        }
        try {
          setRecommendedModels((await api.recommendedModels()).models);
        } catch {
          /* optional */
        }
      } else {
        // Web fallback: OpenAI-compatible probe only (no pull/install support).
        const probe = await probeOllamaModels(undefined);
        if (probe.ok) {
          setStatus({
            origin: probe.baseUrl,
            reachable: true,
            version: null,
            models: probe.modelIds.map((name) => ({
              name,
              size: null,
              digest: null,
              modifiedAt: null,
              details: null,
            })),
            runningModels: [],
            error: null,
          });
          setError(null);
        } else {
          setStatus(null);
          setError(probe.error ?? "Ollama is not reachable");
        }
        setInstallInfo(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setChecking(false);
      setInitialValidationDone(true);
    }
  }, []);

  // Initial detection + slow poll for external changes (Ollama started/stopped).
  useEffect(() => {
    void refresh();
    pollRef.current = window.setInterval(() => {
      void refresh();
    }, 30000);
    return () => {
      if (pollRef.current != null) window.clearInterval(pollRef.current);
    };
  }, [refresh]);

  // Mirror real pull progress into state + TaskCenter.
  useEffect(() => {
    const api = getOllamaDesktopApi();
    if (!api) return;
    return api.onPullProgress((payload) => {
      setActivePulls((prev) => {
        if (payload.state === "ready" || payload.state === "failed" || payload.state === "cancelled") {
          const next = { ...prev };
          delete next[payload.model];
          return next;
        }
        return { ...prev, [payload.model]: payload };
      });
      const taskId = `ollama-pull-${payload.model}`;
      if (payload.state === "ready") {
        upsertTask({
          id: taskId,
          kind: "model-download",
          title: `Downloaded ${payload.model}`,
          detail: "Verified and ready to chat.",
          percent: 100,
          state: "done",
          error: null,
        });
        void refresh();
      } else if (payload.state === "failed") {
        upsertTask({
          id: taskId,
          kind: "model-download",
          title: `Download failed — ${payload.model}`,
          detail: payload.detail || null,
          percent: null,
          state: "failed",
          error: payload.detail || "Download failed",
          onRetry: () => {
            void getOllamaDesktopApi()?.pullModel(payload.model);
          },
        });
      } else if (payload.state === "cancelled") {
        upsertTask({
          id: taskId,
          kind: "model-download",
          title: `Download cancelled — ${payload.model}`,
          detail: null,
          percent: null,
          state: "cancelled",
          error: null,
        });
      } else {
        upsertTask({
          id: taskId,
          kind: "model-download",
          title: `Downloading ${payload.model}`,
          detail: payload.detail || "Downloading in background",
          percent: payload.percent,
          state: "running",
          error: null,
          onCancel: () => {
            void getOllamaDesktopApi()?.cancelPull(payload.model);
          },
        });
      }
    });
  }, [refresh, upsertTask]);

  const setPreferredModel = useCallback((name: string | null) => {
    setPreferredModelState(name);
    try {
      if (name) localStorage.setItem(PREF_KEY, name);
      else localStorage.removeItem(PREF_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const pullModel = useCallback(async (model: string) => {
    const api = getOllamaDesktopApi();
    if (!api) throw new Error("Model downloads require the Openbentt desktop app");
    const name = model.trim();
    if (!name) throw new Error("Invalid model name");
    await api.pullModel(name);
  }, []);

  const cancelPull = useCallback(async (model: string) => {
    const api = getOllamaDesktopApi();
    if (!api) return;
    await api.cancelPull(model);
  }, []);

  const modelNames = useMemo(() => (status?.models ?? []).map((m) => m.name), [status]);
  const auto = useMemo(
    () => autoSelectOllamaModel(modelNames, preferredModel),
    [modelNames, preferredModel]
  );

  const health: LocalAIHealth = useMemo(() => {
    if (checking && !status) return "checking";
    if (!status || !status.reachable) return desktopAvailable ? "unavailable" : "unsupported";
    if (auto.selected) return "ready";
    return "no-models";
  }, [checking, status, auto.selected, desktopAvailable]);

  const localAIForEffective = useMemo(() => ({
    defaultModel: auto.selected,
    defaultReason: auto.reason,
    modelNames,
    runningModels: status?.runningModels ?? [],
    status,
    health,
    preferredModel,
  }), [auto, modelNames, status, health, preferredModel]);

  const effectiveModel = useMemo(() => buildEffectiveModel(apiConfig, localAIForEffective, initialValidationDone), [apiConfig, localAIForEffective, initialValidationDone]);

  const value = useMemo<LocalAIContextValue>(
    () => ({
      health,
      status,
      modelNames,
      runningModels: status?.runningModels ?? [],
      version: status?.version ?? null,
      error,
      defaultModel: auto.selected,
      defaultReason: auto.reason,
      preferredModel,
      setPreferredModel,
      refresh,
      pullModel,
      cancelPull,
      activePulls,
      installInfo,
      recommendedModels,
      checking,
      desktopAvailable,
      initialValidationDone,
      effectiveModel,
    }),
    [
      health, status, modelNames, error, auto, preferredModel, setPreferredModel,
      refresh, pullModel, cancelPull, activePulls, installInfo, recommendedModels,
      checking, desktopAvailable, effectiveModel, initialValidationDone,
    ]
  );

  return <LocalAIContext.Provider value={value}>{children}</LocalAIContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLocalAI(): LocalAIContextValue {
  return useContext(LocalAIContext);
}
