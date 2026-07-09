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
  LOCAL_TINY_MODEL_ID,
  LOCAL_MODEL_CATALOG,
  findLocalModelEntry,
  isLocalGemmaModelId,
  isLegacyLocalGemmaModelId,
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
    expect(await webGpuAdapterSupportsShaderF16()).toBe(false);
  });

  it("returns true when adapter advertises shader-f16", async () => {
    stubAdapter(["shader-f16"], 2 * 1024 ** 3);
    expect(await webGpuAdapterSupportsShaderF16()).toBe(true);
  });
});

describe("pickWebGpuGemmaQuantDtype", () => {
  it("prefers q4f16 when shader-f16 is available", async () => {
    stubAdapter(["shader-f16"], 2 * 1024 ** 3);
    expect(await pickWebGpuGemmaQuantDtype()).toBe("q4f16");
  });

  it("falls back to q4 without shader-f16", async () => {
    stubAdapter([], 2 * 1024 ** 3);
    expect(await pickWebGpuGemmaQuantDtype()).toBe("q4");
  });
});

describe("readWebGpuAdapterCaps", () => {
  it("reads maxBufferSize from adapter limits", async () => {
    stubAdapter(["shader-f16"], 1_073_741_824);
    const caps = await readWebGpuAdapterCaps();
    expect(caps.maxBufferSize).toBe(1_073_741_824);
    expect(caps.supportsShaderF16).toBe(true);
  });
});

describe("requiredBufferBytesForGemma", () => {
  it("returns tiny buffer estimates for the only catalog model", () => {
    const tiny = requiredBufferBytesForGemma(LOCAL_TINY_MODEL_ID, "q4");
    expect(tiny).toBeLessThan(500_000_000);
    const viaLegacy = requiredBufferBytesForGemma(LOCAL_GEMMA_MODEL_E2B, "q4");
    // Legacy ids resolve to tiny via getLocalModelEntry fallback.
    expect(viaLegacy).toBe(tiny);
  });
});

describe("pickLocalGemmaBackend", () => {
  it("forces wasm when preference is wasm", async () => {
    stubAdapter(["shader-f16"], 4 * 1024 ** 3);
    const b = await pickLocalGemmaBackend(LOCAL_TINY_MODEL_ID, "wasm");
    expect(b.device).toBe("wasm");
    expect(b.dtype).toBe("q8");
  });

  it("picks webgpu when buffer fits", async () => {
    stubAdapter(["shader-f16"], 2 * 1024 ** 3);
    const b = await pickLocalGemmaBackend(LOCAL_TINY_MODEL_ID, "auto");
    expect(b.device).toBe("webgpu");
  });

  it("falls back to wasm when buffer is too small", async () => {
    stubAdapter(["shader-f16"], 64 * 1024 ** 2);
    const b = await pickLocalGemmaBackend(LOCAL_TINY_MODEL_ID, "auto");
    expect(b.device).toBe("wasm");
    expect(b.reason).toBe("buffer-too-small");
  });
});

describe("approximateAvailableRamBytes", () => {
  it("uses deviceMemory when present", () => {
    stubNavigator({ deviceMemory: 8 });
    expect(approximateAvailableRamBytes()).toBe(Math.round(8 * 1024 ** 3 * 0.6));
  });

  it("defaults to 4 GiB when deviceMemory is missing", () => {
    stubNavigator({ deviceMemory: undefined });
    expect(approximateAvailableRamBytes()).toBe(4 * 1024 ** 3);
  });
});

describe("pickLocalLlmPlan", () => {
  it("keeps tiny on WebGPU when its buffer fits", async () => {
    stubAdapter(["shader-f16"], 4 * 1024 ** 3);
    const plan = await pickLocalLlmPlan(DEFAULT_LOCAL_GEMMA_MODEL_ID);
    expect(plan.backend.device).toBe("webgpu");
    expect(plan.modelEntry.storedId).toBe(LOCAL_TINY_MODEL_ID);
    expect(plan.autoSwitched).toBe(false);
  });

  it("falls back to WASM+tiny when no WebGPU", async () => {
    stubNavigator({ gpu: undefined, deviceMemory: 8 });
    const plan = await pickLocalLlmPlan(DEFAULT_LOCAL_GEMMA_MODEL_ID);
    expect(plan.backend.device).toBe("wasm");
    expect(plan.backend.dtype).toBe("q8");
    expect(plan.modelEntry.storedId).toBe(FALLBACK_TINY_LOCAL_MODEL_ID);
  });

  it("respects explicit `webgpu` preference without auto-switching model", async () => {
    stubAdapter([], 512 * 1024 ** 2);
    const plan = await pickLocalLlmPlan(DEFAULT_LOCAL_GEMMA_MODEL_ID, "webgpu");
    expect(plan.backend.device).toBe("webgpu");
    expect(plan.autoSwitched).toBe(false);
    expect(plan.modelEntry.storedId).toBe(LOCAL_TINY_MODEL_ID);
  });
});

describe("models catalog", () => {
  it("exposes only the tiny SLM for selection", () => {
    expect(LOCAL_MODEL_CATALOG).toHaveLength(1);
    expect(LOCAL_MODEL_CATALOG[0].storedId).toBe(LOCAL_TINY_MODEL_ID);
    expect(DEFAULT_LOCAL_GEMMA_MODEL_ID).toBe(LOCAL_TINY_MODEL_ID);
  });

  it("isLocalGemmaModelId accepts only the tiny catalog entry", () => {
    expect(isLocalGemmaModelId(LOCAL_TINY_MODEL_ID)).toBe(true);
    expect(isLocalGemmaModelId(LOCAL_GEMMA_MODEL_E2B)).toBe(false);
    expect(isLegacyLocalGemmaModelId(LOCAL_GEMMA_MODEL_E2B)).toBe(true);
    expect(isLocalGemmaModelId("openrouter/foo-bar")).toBe(false);
  });

  it("findLocalModelEntry returns null for unknown ids", () => {
    expect(findLocalModelEntry("nope")).toBeNull();
  });

  it("smallerLocalModelsThan is empty for the only (tiny) entry", () => {
    const tiny = findLocalModelEntry(LOCAL_TINY_MODEL_ID)!;
    expect(smallerLocalModelsThan(tiny)).toEqual([]);
  });
});
