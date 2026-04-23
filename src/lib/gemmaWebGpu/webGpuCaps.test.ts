import { describe, it, expect, vi, afterEach } from "vitest";
import {
  approximateAvailableRamBytes,
  pickLocalGemmaBackend,
  pickLocalLlmPlan,
  pickWebGpuGemmaQuantDtype,
  readWebGpuAdapterCaps,
  requiredBufferBytesForGemma,
  webGpuAdapterSupportsShaderF16,
} from "./webGpuCaps";
import {
  DEFAULT_LOCAL_GEMMA_MODEL_ID,
  FALLBACK_TINY_LOCAL_MODEL_ID,
  LOCAL_GEMMA_MODEL_E2B,
  LOCAL_GEMMA_MODEL_E4B,
  LOCAL_TINY_MODEL_ID,
  LOCAL_COMPACT_QWEN_1_5B,
  LOCAL_MODEL_CATALOG,
  findLocalModelEntry,
  isLocalGemmaModelId,
  smallerLocalModelsThan,
} from "./models";

const origNav = globalThis.navigator;

const stubNavigator = (overrides: Record<string, unknown>) => {
  Object.defineProperty(globalThis, "navigator", {
    value: { ...origNav, ...overrides },
    configurable: true,
  });
};

const stubAdapter = (features: string[], maxBufferSize: number | undefined, extra: Record<string, unknown> = {}) =>
  stubNavigator({
    gpu: {
      requestAdapter: async () => ({
        features: new Set(features),
        limits: maxBufferSize != null ? { maxBufferSize } : undefined,
      }),
    },
    ...extra,
  });

afterEach(() => {
  vi.unstubAllGlobals();
  Object.defineProperty(globalThis, "navigator", { value: origNav, configurable: true });
});

describe("webGpuAdapterSupportsShaderF16", () => {
  it("returns false when WebGPU is missing", async () => {
    stubNavigator({ gpu: undefined });
    await expect(webGpuAdapterSupportsShaderF16()).resolves.toBe(false);
  });

  it("returns true when adapter exposes shader-f16", async () => {
    stubAdapter(["shader-f16"], undefined);
    await expect(webGpuAdapterSupportsShaderF16()).resolves.toBe(true);
  });

  it("returns false when adapter lacks shader-f16", async () => {
    stubAdapter([], undefined);
    await expect(webGpuAdapterSupportsShaderF16()).resolves.toBe(false);
  });
});

describe("pickWebGpuGemmaQuantDtype", () => {
  it("picks q4f16 when shader-f16 is available", async () => {
    stubAdapter(["shader-f16"], undefined);
    await expect(pickWebGpuGemmaQuantDtype()).resolves.toBe("q4f16");
  });

  it("picks q4 when shader-f16 is missing", async () => {
    stubAdapter([], undefined);
    await expect(pickWebGpuGemmaQuantDtype()).resolves.toBe("q4");
  });
});

describe("readWebGpuAdapterCaps", () => {
  it("reads maxBufferSize when exposed", async () => {
    stubAdapter([], 1_073_741_824);
    await expect(readWebGpuAdapterCaps()).resolves.toEqual({
      supportsShaderF16: false,
      maxBufferSize: 1_073_741_824,
    });
  });

  it("returns null maxBufferSize when WebGPU unavailable", async () => {
    stubNavigator({ gpu: undefined });
    await expect(readWebGpuAdapterCaps()).resolves.toEqual({
      supportsShaderF16: false,
      maxBufferSize: null,
    });
  });
});

describe("requiredBufferBytesForGemma", () => {
  it("E4B needs more than E2B", () => {
    const e2b = requiredBufferBytesForGemma("onnx-community/gemma-4-E2B-it-ONNX", "q4");
    const e4b = requiredBufferBytesForGemma("onnx-community/gemma-4-E4B-it-ONNX", "q4");
    expect(e4b).toBeGreaterThan(e2b);
  });

  it("q4 needs at least as much as q4f16", () => {
    const q4 = requiredBufferBytesForGemma("onnx-community/gemma-4-E2B-it-ONNX", "q4");
    const q4f16 = requiredBufferBytesForGemma("onnx-community/gemma-4-E2B-it-ONNX", "q4f16");
    expect(q4).toBeGreaterThanOrEqual(q4f16);
  });

  it("tiny model needs less than E2B", () => {
    const tiny = requiredBufferBytesForGemma(LOCAL_TINY_MODEL_ID, "q4");
    const e2b = requiredBufferBytesForGemma(LOCAL_GEMMA_MODEL_E2B, "q4");
    expect(tiny).toBeLessThan(e2b);
  });

  it("accepts stored ids and hf repos interchangeably", () => {
    const viaStored = requiredBufferBytesForGemma(LOCAL_GEMMA_MODEL_E2B, "q4");
    const viaRepo = requiredBufferBytesForGemma("onnx-community/gemma-4-E2B-it-ONNX", "q4");
    expect(viaStored).toBe(viaRepo);
  });
});

describe("pickLocalGemmaBackend (legacy API)", () => {
  it("picks webgpu + q4f16 when adapter has shader-f16 and large buffers", async () => {
    stubAdapter(["shader-f16"], 4 * 1024 ** 3);
    const b = await pickLocalGemmaBackend("onnx-community/gemma-4-E2B-it-ONNX");
    expect(b.device).toBe("webgpu");
    expect(b.dtype).toBe("q4f16");
  });

  it("falls back to wasm + fp16 when GPU buffer is too small", async () => {
    stubAdapter([], 1 * 1024 ** 3);
    const b = await pickLocalGemmaBackend("onnx-community/gemma-4-E2B-it-ONNX");
    expect(b.device).toBe("wasm");
    expect(b.dtype).toBe("fp16");
    expect(b.reason).toBe("buffer-too-small");
  });

  it("uses fp16 on wasm (CPU has no GatherBlockQuantized kernel)", async () => {
    stubAdapter(["shader-f16"], 4 * 1024 ** 3);
    const b = await pickLocalGemmaBackend("onnx-community/gemma-4-E2B-it-ONNX", "wasm");
    expect(b.device).toBe("wasm");
    expect(b.dtype).toBe("fp16");
  });

  it("forces webgpu when preference is webgpu (even with small buffer)", async () => {
    stubAdapter([], 1 * 1024 ** 3);
    const b = await pickLocalGemmaBackend("onnx-community/gemma-4-E2B-it-ONNX", "webgpu");
    expect(b.device).toBe("webgpu");
  });
});

describe("approximateAvailableRamBytes", () => {
  it("uses navigator.deviceMemory when present", () => {
    stubNavigator({ deviceMemory: 8 });
    expect(approximateAvailableRamBytes()).toBeGreaterThan(3 * 1024 ** 3);
  });

  it("falls back to 4 GB when deviceMemory is not exposed", () => {
    stubNavigator({ deviceMemory: undefined });
    expect(approximateAvailableRamBytes()).toBe(4 * 1024 ** 3);
  });
});

describe("pickLocalLlmPlan", () => {
  it("keeps the requested model on WebGPU when its largest buffer fits", async () => {
    stubAdapter(["shader-f16"], 4 * 1024 ** 3);
    const plan = await pickLocalLlmPlan(DEFAULT_LOCAL_GEMMA_MODEL_ID);
    expect(plan.backend.device).toBe("webgpu");
    expect(plan.modelEntry.storedId).toBe(DEFAULT_LOCAL_GEMMA_MODEL_ID);
    expect(plan.autoSwitched).toBe(false);
  });

  it("auto-downgrades E4B → E2B when GPU only has a 1.5 GiB buffer", async () => {
    stubAdapter(["shader-f16"], 1_500_000_000);
    const plan = await pickLocalLlmPlan(LOCAL_GEMMA_MODEL_E4B);
    expect(plan.backend.device).toBe("webgpu");
    expect(plan.autoSwitched).toBe(true);
    expect(plan.modelEntry.storedId).toBe(DEFAULT_LOCAL_GEMMA_MODEL_ID);
    expect(plan.originalRequest?.storedId).toBe(LOCAL_GEMMA_MODEL_E4B);
    expect(plan.switchReason).toBe("gpu-buffer");
  });

  it("auto-downgrades E2B → compact (Qwen 1.5B) when GPU has a 1 GiB buffer", async () => {
    stubAdapter(["shader-f16"], 1 * 1024 ** 3);
    const plan = await pickLocalLlmPlan(DEFAULT_LOCAL_GEMMA_MODEL_ID);
    expect(plan.backend.device).toBe("webgpu");
    expect(plan.modelEntry.storedId).toBe(LOCAL_COMPACT_QWEN_1_5B);
    expect(plan.autoSwitched).toBe(true);
    expect(plan.switchReason).toBe("gpu-buffer");
  });

  it("falls back to WASM+tiny when no WebGPU and device RAM is tiny", async () => {
    stubNavigator({ gpu: undefined, deviceMemory: 1 });
    const plan = await pickLocalLlmPlan(DEFAULT_LOCAL_GEMMA_MODEL_ID);
    expect(plan.backend.device).toBe("wasm");
    expect(plan.backend.dtype).toBe("fp16");
    expect(plan.modelEntry.storedId).toBe(FALLBACK_TINY_LOCAL_MODEL_ID);
    expect(plan.autoSwitched).toBe(true);
  });

  it("keeps WASM on requested model when RAM budget fits it", async () => {
    stubNavigator({ gpu: undefined, deviceMemory: 8 });
    const plan = await pickLocalLlmPlan(DEFAULT_LOCAL_GEMMA_MODEL_ID);
    expect(plan.backend.device).toBe("wasm");
    expect(plan.modelEntry.storedId).toBe(DEFAULT_LOCAL_GEMMA_MODEL_ID);
    expect(plan.autoSwitched).toBe(false);
  });

  it("respects explicit `webgpu` preference without auto-switching model", async () => {
    stubAdapter([], 512 * 1024 ** 2);
    const plan = await pickLocalLlmPlan(DEFAULT_LOCAL_GEMMA_MODEL_ID, "webgpu");
    expect(plan.backend.device).toBe("webgpu");
    expect(plan.autoSwitched).toBe(false);
  });
});

describe("models catalog", () => {
  it("contains expected size tiers (medium/small/compact/tiny)", () => {
    const sizes = LOCAL_MODEL_CATALOG.map((m) => m.size);
    expect(new Set(sizes)).toEqual(new Set(["medium", "small", "compact", "tiny"]));
  });

  it("isLocalGemmaModelId accepts every catalog entry (and the tiny model)", () => {
    for (const m of LOCAL_MODEL_CATALOG) {
      expect(isLocalGemmaModelId(m.storedId)).toBe(true);
    }
    expect(isLocalGemmaModelId("openrouter/foo-bar")).toBe(false);
  });

  it("findLocalModelEntry returns null for unknown ids", () => {
    expect(findLocalModelEntry("nope")).toBeNull();
  });

  it("smallerLocalModelsThan is strictly smaller (no self-include)", () => {
    const e4b = findLocalModelEntry(LOCAL_GEMMA_MODEL_E4B)!;
    const smaller = smallerLocalModelsThan(e4b);
    expect(smaller.map((m) => m.storedId)).not.toContain(LOCAL_GEMMA_MODEL_E4B);
    expect(smaller.map((m) => m.storedId)).toContain(LOCAL_TINY_MODEL_ID);
    expect(smaller.map((m) => m.storedId)).toContain(DEFAULT_LOCAL_GEMMA_MODEL_ID);
    expect(smaller.map((m) => m.storedId)).toContain(LOCAL_COMPACT_QWEN_1_5B);
  });
});
