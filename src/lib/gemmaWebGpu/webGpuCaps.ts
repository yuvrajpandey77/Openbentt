import {
  DEFAULT_LOCAL_GEMMA_MODEL_ID,
  FALLBACK_TINY_LOCAL_MODEL_ID,
  LOCAL_MODEL_CATALOG,
  findLocalModelEntry,
  getLocalModelEntry,
  hfRepoIdForStoredModel,
  smallerLocalModelsThan,
  type LocalModelEntry,
} from "@/lib/gemmaWebGpu/models";

export interface WebGpuAdapterCaps {
  supportsShaderF16: boolean;
  /** From `adapter.limits.maxBufferSize`. Many Linux / integrated adapters cap at 1 GiB (2^30). */
  maxBufferSize: number | null;
}

/**
 * Single `requestAdapter()` so we read features and limits consistently.
 * `q4f16` ONNX graphs use WGSL f16; adapters without `shader-f16` fail at session creation with errors like
 * "Transpose requires f16 but the device does not support it."
 */
export async function readWebGpuAdapterCaps(): Promise<WebGpuAdapterCaps> {
  if (typeof navigator === "undefined" || !navigator.gpu) {
    return { supportsShaderF16: false, maxBufferSize: null };
  }
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return { supportsShaderF16: false, maxBufferSize: null };
    const limits = (adapter as { limits?: { maxBufferSize?: number } }).limits;
    const maxBufferSize =
      limits && typeof limits.maxBufferSize === "number" ? limits.maxBufferSize : null;
    return {
      supportsShaderF16: adapter.features.has("shader-f16"),
      maxBufferSize,
    };
  } catch {
    return { supportsShaderF16: false, maxBufferSize: null };
  }
}

export async function webGpuAdapterSupportsShaderF16(): Promise<boolean> {
  return (await readWebGpuAdapterCaps()).supportsShaderF16;
}

export async function pickWebGpuGemmaQuantDtype(): Promise<"q4f16" | "q4"> {
  return (await readWebGpuAdapterCaps()).supportsShaderF16 ? "q4f16" : "q4";
}

/**
 * Approximate RAM (bytes) the browser tab can realistically hand to WASM at fp16.
 * `navigator.deviceMemory` is bucketed (0.25, 0.5, 1, 2, 4, 8); not all browsers expose it, so we
 * default to a generous 4 GB when unknown.
 */
export function approximateAvailableRamBytes(): number {
  if (typeof navigator === "undefined") return 4 * 1024 ** 3;
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
  if (typeof mem === "number" && mem > 0) {
    /** Assume at most ~60% of device RAM is usable by the tab (OS + other tabs + Electron chrome). */
    return Math.round(mem * 1024 ** 3 * 0.6);
  }
  return 4 * 1024 ** 3;
}

/**
 * @deprecated Prefer {@link requiredBufferBytesForEntry}. Kept so existing callers (e.g.
 * {@link pickLocalGemmaBackend}) that pass `hfRepo` or `storedId` strings still work.
 */
export function requiredBufferBytesForGemma(
  repoId: string,
  dtype: "q4f16" | "q4"
): number {
  const entry =
    LOCAL_MODEL_CATALOG.find((m) => m.hfRepo === repoId || m.storedId === repoId) ??
    findLocalModelEntry(repoId) ??
    getLocalModelEntry(DEFAULT_LOCAL_GEMMA_MODEL_ID);
  return requiredBufferBytesForEntry(entry, dtype);
}

export function requiredBufferBytesForEntry(
  entry: LocalModelEntry,
  dtype: "q4f16" | "q4"
): number {
  return dtype === "q4" ? entry.gpuBufferBytesQ4 : entry.gpuBufferBytesQ4f16;
}

export type LocalGemmaDevice = "webgpu" | "wasm";
/**
 * `q4` / `q4f16` require WebGPU (ORT-web's WASM EP has no `GatherBlockQuantized` kernel).
 * `fp16` is the CPU-safe export shared by all the on-device ONNX repos we use.
 */
export type LocalGemmaDtype = "q4f16" | "q4" | "fp16";

export type LocalBackendReason =
  | "webgpu-ready"
  | "no-webgpu"
  | "no-shader-f16-not-needed"
  | "buffer-too-small"
  | "forced-wasm"
  | "forced-webgpu";

export interface LocalGemmaBackend {
  device: LocalGemmaDevice;
  dtype: LocalGemmaDtype;
  /** Why we picked this backend (shown in UI when we fall back to CPU). */
  reason?: LocalBackendReason;
}

export type LocalGemmaBackendPreference = "auto" | "webgpu" | "wasm";

/**
 * Choose the best backend for on-device Gemma given the user's GPU.
 * Preserved for backward compatibility – prefer {@link pickLocalLlmPlan} which also selects a model.
 */
export async function pickLocalGemmaBackend(
  repoId: string,
  preference: LocalGemmaBackendPreference = "auto"
): Promise<LocalGemmaBackend> {
  if (preference === "wasm") {
    return { device: "wasm", dtype: "fp16", reason: "forced-wasm" };
  }
  const caps = await readWebGpuAdapterCaps();
  const webgpuDtype: Extract<LocalGemmaDtype, "q4f16" | "q4"> = caps.supportsShaderF16 ? "q4f16" : "q4";
  if (preference === "webgpu") {
    return { device: "webgpu", dtype: webgpuDtype, reason: "forced-webgpu" };
  }
  if (caps.maxBufferSize == null) {
    return { device: "wasm", dtype: "fp16", reason: "no-webgpu" };
  }
  const required = requiredBufferBytesForGemma(repoId, webgpuDtype);
  if (caps.maxBufferSize < required) {
    return { device: "wasm", dtype: "fp16", reason: "buffer-too-small" };
  }
  return { device: "webgpu", dtype: webgpuDtype, reason: "webgpu-ready" };
}

export interface LocalLlmPlan {
  backend: LocalGemmaBackend;
  /** The model we'll actually load (may differ from the requested one when auto-switching). */
  modelEntry: LocalModelEntry;
  /** The user's original choice; set when we had to switch to a smaller model. */
  originalRequest: LocalModelEntry | null;
  /** True when {@link modelEntry} is not the user's original request. */
  autoSwitched: boolean;
  /** Short machine tag explaining the switch (used for toasts / telemetry). */
  switchReason?: "gpu-buffer" | "cpu-ram" | "no-webgpu";
}

/**
 * End-to-end planner: pick device + dtype AND the lightest viable model for this hardware.
 *
 * Strategy:
 *   1. Honour explicit `webgpu` / `wasm` preferences (used from Settings for debugging).
 *   2. Prefer the requested model on WebGPU if its largest buffer fits `maxBufferSize`.
 *   3. Otherwise walk down {@link smallerLocalModelsThan} and try the next model on WebGPU.
 *   4. Fall back to WASM on the requested model if estimated RAM fits, else the tiny model.
 */
export async function pickLocalLlmPlan(
  storedModelId: string,
  preference: LocalGemmaBackendPreference = "auto"
): Promise<LocalLlmPlan> {
  const requested = getLocalModelEntry(storedModelId);

  if (preference === "wasm") {
    const fitsCpu = requested.wasmRamBytes <= approximateAvailableRamBytes();
    const chosen = fitsCpu ? requested : (findLocalModelEntry(FALLBACK_TINY_LOCAL_MODEL_ID) ?? requested);
    return {
      backend: { device: "wasm", dtype: "fp16", reason: "forced-wasm" },
      modelEntry: chosen,
      originalRequest: chosen.storedId === requested.storedId ? null : requested,
      autoSwitched: chosen.storedId !== requested.storedId,
      switchReason: chosen.storedId !== requested.storedId ? "cpu-ram" : undefined,
    };
  }

  const caps = await readWebGpuAdapterCaps();
  const webgpuDtype: Extract<LocalGemmaDtype, "q4f16" | "q4"> = caps.supportsShaderF16 ? "q4f16" : "q4";

  if (preference === "webgpu") {
    return {
      backend: { device: "webgpu", dtype: webgpuDtype, reason: "forced-webgpu" },
      modelEntry: requested,
      originalRequest: null,
      autoSwitched: false,
    };
  }

  if (caps.maxBufferSize != null) {
    const requestedFitsGpu = requiredBufferBytesForEntry(requested, webgpuDtype) <= caps.maxBufferSize;
    if (requestedFitsGpu) {
      return {
        backend: { device: "webgpu", dtype: webgpuDtype, reason: "webgpu-ready" },
        modelEntry: requested,
        originalRequest: null,
        autoSwitched: false,
      };
    }
    for (const smaller of smallerLocalModelsThan(requested).reverse()) {
      /** Reversed so we try `small` before `tiny` – prefer the largest that still fits. */
      if (requiredBufferBytesForEntry(smaller, webgpuDtype) <= caps.maxBufferSize) {
        return {
          backend: { device: "webgpu", dtype: webgpuDtype, reason: "webgpu-ready" },
          modelEntry: smaller,
          originalRequest: requested,
          autoSwitched: true,
          switchReason: "gpu-buffer",
        };
      }
    }
  }

  /** No WebGPU (or even the tiny model doesn't fit its buffer) → WASM on whatever RAM allows. */
  const ramBudget = approximateAvailableRamBytes();
  const wasmTarget =
    requested.wasmRamBytes <= ramBudget
      ? requested
      : (smallerLocalModelsThan(requested).find((m) => m.wasmRamBytes <= ramBudget) ??
        findLocalModelEntry(FALLBACK_TINY_LOCAL_MODEL_ID) ??
        requested);
  const autoSwitched = wasmTarget.storedId !== requested.storedId;
  return {
    backend: {
      device: "wasm",
      dtype: "fp16",
      reason: caps.maxBufferSize == null ? "no-webgpu" : "buffer-too-small",
    },
    modelEntry: wasmTarget,
    originalRequest: autoSwitched ? requested : null,
    autoSwitched,
    switchReason: autoSwitched ? (caps.maxBufferSize == null ? "no-webgpu" : "cpu-ram") : undefined,
  };
}

/** Small helper so non-picker callers can ask "does my current device need the tiny model?" */
export async function shouldPreferTinyLocalModel(): Promise<boolean> {
  const plan = await pickLocalLlmPlan(DEFAULT_LOCAL_GEMMA_MODEL_ID);
  return plan.modelEntry.storedId === FALLBACK_TINY_LOCAL_MODEL_ID;
}

/** Re-export `hfRepoIdForStoredModel` so inference can resolve repos via caps utilities. */
export { hfRepoIdForStoredModel };
