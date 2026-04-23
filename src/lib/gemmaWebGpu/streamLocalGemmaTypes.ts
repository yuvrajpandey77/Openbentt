import type { OpenRouterStreamCallbacks } from "@/lib/openrouter";
import type { LocalGemmaBackend, LocalGemmaDtype } from "@/lib/gemmaWebGpu/webGpuCaps";
import type { LocalModelEntry } from "@/lib/gemmaWebGpu/models";

/**
 * Callbacks for the on-device chat stream.
 *
 * These surface progress and adaptive-fallback events to the UI so users understand when the
 * picker auto-downgrades the model or the backend (e.g. tiny model on WASM for a 1 GiB GPU).
 */
export type StreamLocalGemmaChatCallbacks = OpenRouterStreamCallbacks & {
  /** 0–100 while weights are downloading; `null` once loading finishes and generation starts. */
  onModelDownloadProgress?: (percent: number | null) => void;
  /** Fires once per load so the UI can show "Running on CPU (slower)" when WebGPU isn't feasible. */
  onBackendPicked?: (backend: LocalGemmaBackend) => void;
  /** Fires when the picker had to switch to a smaller model because of GPU / RAM limits. */
  onModelAutoSwitched?: (info: {
    from: LocalModelEntry;
    to: LocalModelEntry;
    reason: "gpu-buffer" | "cpu-ram" | "no-webgpu" | undefined;
  }) => void;
  /** Fires when the dtype cascade retries with a broader dtype after a recoverable load error. */
  onDtypeFallback?: (info: { from: LocalGemmaDtype; to: LocalGemmaDtype }) => void;
};
