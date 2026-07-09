import {
  FALLBACK_TINY_LOCAL_MODEL_ID,
  findLocalModelEntry,
  type LocalModelEntry,
} from "@/lib/gemmaWebGpu/models";
import {
  pickLocalLlmPlan,
  type LocalGemmaBackend,
  type LocalGemmaBackendPreference,
  type LocalGemmaDtype,
  type LocalLlmPlan,
} from "@/lib/gemmaWebGpu/webGpuCaps";
import { stripSpecialTokens, isStopSpecialTokenChunk } from "@/lib/gemmaWebGpu/stripGemmaStreamChunk";
import { chatCompletionMessagesToGemmaPrompt } from "@/lib/gemmaWebGpu/gemmaPrompt";
import type { LocalInferenceProfile } from "@/types/chat";
import { markLocalModelCached } from "@/lib/gemmaWebGpu/localModelCacheFlag";

type HF = typeof import("@huggingface/transformers");

let hfPromise: Promise<HF> | null = null;

/**
 * Do not override `env.backends.onnx.wasm.wasmPaths`: `@huggingface/transformers` pins a matching
 * `onnxruntime-web` (e.g. 1.25.x-dev) and sets CDN paths internally. Forcing older `public/ort` (1.20)
 * or mismatched JSEP URLs causes runtime errors such as `webgpuInit is not a function`.
 */
async function getTransformers(): Promise<HF> {
  if (!hfPromise) {
    hfPromise = import("@huggingface/transformers").then(async (tf) => {
      try {
        /** Prefer browser cache; never block on local file paths in Vite. */
        tf.env.allowLocalModels = false;
        tf.env.useBrowserCache = true;
      } catch {
        /* env may be frozen in some builds */
      }
      return tf;
    });
  }
  return hfPromise;
}

/**
 * Generic handle to whatever HF model class we loaded for this entry. We keep it typed loosely here
 * because `Gemma4ForConditionalGeneration` and `AutoModelForCausalLM` have compatible enough
 * `generate()` / `dispose()` surfaces for our streaming path, but their exact declared types don't
 * line up through HF's conditional generics.
 */
interface LoadedLlm {
  model: {
    generate: (args: Record<string, unknown>) => Promise<unknown>;
    dispose: () => Promise<void>;
  };
  /** For Gemma we get this via `AutoProcessor.tokenizer`; for text-only we load `AutoTokenizer`. */
  tokenizer: {
    apply_chat_template?: (
      messages: Array<{ role: string; content: string }>,
      opts: { tokenize?: boolean; add_generation_prompt?: boolean }
    ) => string | unknown;
    (
      text: string,
      opts?: {
        add_special_tokens?: boolean;
        return_tensor?: boolean | string;
        max_length?: number;
        truncation?: boolean;
      }
    ): { input_ids: { size: number } };
  } & Record<string, unknown>;
  entry: LocalModelEntry;
  backend: LocalGemmaBackend;
}

let loaded: LoadedLlm | null = null;
/** Serializes loads so concurrent callers (e.g. model switch) run in order. */
let loadChain: Promise<void> = Promise.resolve();
/**
 * Serialize `generate()` — overlapping ORT Web / WASM inference corrupts the WASM stack and surfaces as
 * `table index is out of bounds` or `memory access out of bounds`.
 */
let generateSerial: Promise<unknown> = Promise.resolve();
/** @huggingface/transformers: InterruptableStoppingCriteria used to end generate() when the user hits Stop. */
let currentInterruptCriteria: { interrupt: () => void } | null = null;

/** Many ONNX exports are shorter than tokenizer `model_max_length`; stay conservative for stable ORT graphs. */
const ONNX_CONTEXT_HARD_CAP = 8192;

function tokenizerConfiguredMaxLen(tokenizer: LoadedLlm["tokenizer"]): number {
  const raw = (tokenizer as { model_max_length?: unknown }).model_max_length;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return Math.min(Math.floor(raw), 131072);
  }
  return ONNX_CONTEXT_HARD_CAP;
}

/** Max prompt tokens so prompt + max_new_tokens stays within a safe window for the loaded model. */
function maxPromptTokensForGenerate(entry: LocalModelEntry, tokenizer: LoadedLlm["tokenizer"], maxNewTokens: number): number {
  const tokMax = tokenizerConfiguredMaxLen(tokenizer);
  const graphBudget = Math.min(entry.contextLength, ONNX_CONTEXT_HARD_CAP, tokMax);
  return Math.max(128, graphBudget - maxNewTokens - 32);
}

export function abortLocalGemmaGeneration(): void {
  currentInterruptCriteria?.interrupt();
  currentInterruptCriteria = null;
}

export async function unloadLocalGemma(): Promise<void> {
  abortLocalGemmaGeneration();
  if (loaded) {
    await loaded.model.dispose().catch(() => {});
    loaded = null;
  }
}

export function currentLocalGemmaBackend(): LocalGemmaBackend | null {
  return loaded?.backend ?? null;
}

export function currentLocalModelEntry(): LocalModelEntry | null {
  return loaded?.entry ?? null;
}

export function isLocalGemmaWeightsLoaded(): boolean {
  return loaded != null;
}

export interface EnsureLocalGemmaOptions {
  backendPreference?: LocalGemmaBackendPreference;
  onBackendPicked?: (backend: LocalGemmaBackend) => void;
  /** Fires when the picker downgrades to a smaller model (WebGPU buffer or RAM can't fit request). */
  onModelAutoSwitched?: (info: {
    from: LocalModelEntry;
    to: LocalModelEntry;
    reason: LocalLlmPlan["switchReason"];
  }) => void;
  /** Fires when we retry loading with a fallback dtype (e.g. fp16 → fp32) after a missing-op error. */
  onDtypeFallback?: (info: { from: LocalGemmaDtype; to: LocalGemmaDtype }) => void;
}

/** Recoverable load errors that should trigger a dtype / model cascade rather than bubble to UI. */
function isRecoverableLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /Could not find an implementation|no available backend|Failed to get GPU adapter|GPU buffer too small|exceeds the max buffer size limit|WebGPU validation failed|requires f16 but the device does not support|Device failed at creation|out of memory|OOM|bad_alloc|ERROR_CODE:\s*6|error code\s*=?\s*6|Failed to create.*device|Invalid ShaderModule|GPUDevice|webgpu|can'?t create session|cannot create session|create.?session|InferenceSession|onnxruntime|ORT_|Failed to create tensor|EP Error|provider.*not available|Failed to allocate/i.test(
    msg
  );
}

/** Normalize HF progress_callback payloads (fraction 0–1 or percent 0–100). */
function normalizeHfProgress(raw: unknown): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  if (raw >= 0 && raw <= 1) return Math.round(raw * 100);
  if (raw > 1 && raw <= 100) return Math.round(raw);
  return null;
}

/** Lightest ordering of fallback dtypes per device, tried in sequence on recoverable errors. */
function dtypeCascade(initial: LocalGemmaBackend): LocalGemmaDtype[] {
  if (initial.device === "webgpu") {
    /** Prefer quantized GPU graphs; q8 is a lighter WebGPU option some ORT builds accept. */
    if (initial.dtype === "q4f16") return ["q4f16", "q4", "q8"];
    if (initial.dtype === "q4") return ["q4", "q8"];
    return ["q8", "q4"];
  }
  /**
   * WASM: q8 first (small, avoids ORT error 6 / bad_alloc from fp16).
   * q4 often fails on WASM (missing GatherBlockQuantized). fp16 last if q8 missing.
   */
  return initial.dtype === "fp16" ? ["fp16", "q8"] : ["q8", "fp16"];
}

export async function ensureLocalGemmaLoaded(
  storedModelId: string,
  onProgress: (pct: number) => void,
  signal: AbortSignal,
  options?: EnsureLocalGemmaOptions
): Promise<void> {
  const plan = await pickLocalLlmPlan(storedModelId, options?.backendPreference);
  options?.onBackendPicked?.(plan.backend);
  if (plan.autoSwitched && plan.originalRequest) {
    options?.onModelAutoSwitched?.({
      from: plan.originalRequest,
      to: plan.modelEntry,
      reason: plan.switchReason,
    });
  }

  if (
    loaded &&
    loaded.entry.storedId === plan.modelEntry.storedId &&
    loaded.backend.device === plan.backend.device &&
    loaded.backend.dtype === plan.backend.dtype
  ) {
    return;
  }

  const run = async () => {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    if (loaded && loaded.entry.storedId !== plan.modelEntry.storedId) {
      await unloadLocalGemma();
    }

    const tf = await getTransformers();
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");

    const fileProgress = new Map<string, number>();
    let lastReported = -1;
    const progress_callback = (info: {
      status?: string;
      file?: string;
      progress?: number;
      loaded?: number;
      total?: number;
    }) => {
      const status = info.status ?? "";
      if (status === "initiate" || status === "download") {
        if (lastReported < 0) {
          lastReported = 0;
          onProgress(0);
        }
        return;
      }
      if (status === "done" && info.file) {
        fileProgress.set(info.file, 100);
      } else if (status === "progress") {
        let pct = normalizeHfProgress(info.progress);
        if (pct == null && info.loaded != null && info.total != null && info.total > 0) {
          pct = Math.round((info.loaded / info.total) * 100);
        }
        if (pct != null) {
          fileProgress.set(info.file ?? "_", pct);
        }
      } else {
        return;
      }
      const values = [...fileProgress.values()];
      if (values.length === 0) return;
      const overall = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
      if (overall !== lastReported) {
        lastReported = overall;
        onProgress(Math.min(100, Math.max(0, overall)));
      }
    };

    const tryLoad = async (entry: LocalModelEntry, backend: LocalGemmaBackend): Promise<LoadedLlm> => {
      const cascade = dtypeCascade(backend);
      let lastErr: unknown;
      for (let i = 0; i < cascade.length; i++) {
        const dtype = cascade[i]!;
        if (i > 0) {
          options?.onDtypeFallback?.({ from: cascade[i - 1]!, to: dtype });
        }
        try {
          /**
           * `from_pretrained` is a static method that uses `this.MODEL_CLASS_MAPPINGS` internally.
           * Call it directly on the class (never via an extracted reference) or `this` becomes
           * `undefined` after minification and we get "Cannot read properties of undefined
           * (reading 'MODEL_CLASS_MAPPINGS')".
           */
          const modelPromise =
            entry.modelClass === "gemma4"
              ? tf.Gemma4ForConditionalGeneration.from_pretrained(entry.hfRepo, {
                  dtype,
                  device: backend.device,
                  progress_callback,
                })
              : tf.AutoModelForCausalLM.from_pretrained(entry.hfRepo, {
                  dtype,
                  device: backend.device,
                  progress_callback,
                });
          const tokenizerPromise =
            entry.modelClass === "gemma4"
              ? tf.AutoProcessor.from_pretrained(entry.hfRepo).then((p) => p.tokenizer)
              : tf.AutoTokenizer.from_pretrained(entry.hfRepo);
          const [model, tokenizer] = await Promise.all([modelPromise, tokenizerPromise]);
          return {
            model: model as unknown as LoadedLlm["model"],
            tokenizer: tokenizer as unknown as LoadedLlm["tokenizer"],
            entry,
            backend: { ...backend, dtype },
          };
        } catch (e) {
          lastErr = e;
          if (!isRecoverableLoadError(e) || i === cascade.length - 1) break;
        }
      }
      throw lastErr instanceof Error
        ? lastErr
        : new Error(typeof lastErr === "string" ? lastErr : "Failed to load on-device model");
    };

    /**
     * Try the planned (entry, backend) combo. If WebGPU fails (common: "Can't create session"),
     * unload any partial GPU state and fall through to WASM/CPU fp16 so /chat still works.
     */
    try {
      loaded = await tryLoad(plan.modelEntry, plan.backend);
    } catch (e) {
      const tiny = findLocalModelEntry(FALLBACK_TINY_LOCAL_MODEL_ID) ?? plan.modelEntry;
      const shouldTryWasm =
        plan.backend.device === "webgpu" &&
        (isRecoverableLoadError(e) ||
          /session|webgpu|gpu|onnx|ort_|adapter|device/i.test(
            e instanceof Error ? e.message : String(e)
          ));

      if (shouldTryWasm) {
        await unloadLocalGemma().catch(() => {});
        if (plan.modelEntry.storedId !== tiny.storedId) {
          options?.onModelAutoSwitched?.({
            from: plan.modelEntry,
            to: tiny,
            reason: "gpu-buffer",
          });
        }
        options?.onBackendPicked?.({ device: "wasm", dtype: "q8", reason: "no-webgpu" });
        onProgress(0);
        loaded = await tryLoad(tiny, { device: "wasm", dtype: "q8", reason: "no-webgpu" });
      } else if (isRecoverableLoadError(e) && plan.backend.device === "wasm") {
        /** Already on WASM — retry q8↔fp16 cascade via a fresh unload (partial session may leak). */
        await unloadLocalGemma().catch(() => {});
        onProgress(0);
        const altDtype: LocalGemmaDtype = plan.backend.dtype === "q8" ? "fp16" : "q8";
        options?.onDtypeFallback?.({ from: plan.backend.dtype, to: altDtype });
        loaded = await tryLoad(tiny, {
          device: "wasm",
          dtype: altDtype,
          reason: plan.backend.reason,
        });
      } else if (
        isRecoverableLoadError(e) &&
        plan.modelEntry.storedId !== tiny.storedId
      ) {
        await unloadLocalGemma().catch(() => {});
        options?.onModelAutoSwitched?.({
          from: plan.modelEntry,
          to: tiny,
          reason: "cpu-ram",
        });
        loaded = await tryLoad(tiny, { device: "wasm", dtype: "q8", reason: plan.backend.reason });
      } else {
        throw e;
      }
    }

    if (signal.aborted) {
      await unloadLocalGemma();
      throw new DOMException("Aborted", "AbortError");
    }

    if (loaded) {
      markLocalModelCached(loaded.entry.storedId);
    }
  };

  const mine = loadChain.then(async () => {
    try {
      await run();
    } catch (e) {
      await unloadLocalGemma();
      throw e;
    }
  });
  loadChain = mine.catch(() => {});
  await mine;
}

export function effectiveMaxNewTokens(
  entry: LocalModelEntry,
  profile: LocalInferenceProfile,
  override?: number
): number {
  if (override != null) return Math.max(1, override);
  const b = entry.defaultMaxTokens;
  switch (profile) {
    case "eco":
      return Math.min(128, Math.max(48, Math.floor(b * 0.4)));
    case "balanced":
      return Math.min(256, Math.floor(b * 0.75));
    case "performance":
    default:
      return Math.min(384, b);
  }
}

export interface GenerateLocalOptions {
  maxTokens?: number;
  onChunk?: (text: string) => void;
  /** Used when `maxTokens` is omitted. */
  inferenceProfile?: LocalInferenceProfile;
}

/**
 * Build the model's chat-formatted prompt from OpenAI-style messages. Uses the tokenizer's native
 * chat template when available (Qwen ChatML, Gemma turn tags, etc.), falling back to our hand-built
 * Gemma template if the tokenizer somehow lacks one.
 */
export function buildLocalPrompt(
  tokenizer: LoadedLlm["tokenizer"],
  apiMessages: Array<{ role: string; content: unknown }>
): string {
  const cleaned = apiMessages.map((m) => {
    const flat = flattenContent(m.content);
    const scrubbed = stripSpecialTokens(flat).trim();
    return { role: m.role, content: scrubbed || flat };
  });
  try {
    if (typeof tokenizer.apply_chat_template === "function") {
      const out = tokenizer.apply_chat_template(cleaned, {
        tokenize: false,
        add_generation_prompt: true,
      });
      if (typeof out === "string" && out.length > 0) return out;
    }
  } catch {
    /** Some tokenizer configs throw for unknown roles; fall through to the manual Gemma builder. */
  }
  return chatCompletionMessagesToGemmaPrompt(cleaned);
}

function flattenContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const out: string[] = [];
    let hadNonText = false;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const p = part as { type?: string; text?: string };
      if (p.type === "text" && typeof p.text === "string") out.push(p.text);
      else if (p.type === "image_url" || p.type === "input_audio") hadNonText = true;
    }
    let text = out.join("\n").trim();
    if (hadNonText) {
      text = text
        ? `${text}\n\n[Note: image/audio parts are omitted for the on-device model.]`
        : "[Note: image/audio parts are omitted for the on-device model.]";
    }
    return text;
  }
  return JSON.stringify(content);
}

/** Default generation budget tuned for the currently loaded model (small models can afford more). */
export function defaultMaxTokensForLoaded(profile: LocalInferenceProfile = "balanced"): number {
  if (!loaded) return 512;
  return effectiveMaxNewTokens(loaded.entry, profile);
}

async function executeGenerateLocalGemma(
  prompt: string,
  options?: GenerateLocalOptions
): Promise<{ raw: string; visible: string }> {
  if (!loaded) {
    throw new Error("Local model is not loaded");
  }

  const tf = await getTransformers();
  const maxNew =
    options?.maxTokens ??
    (loaded
      ? effectiveMaxNewTokens(loaded.entry, options?.inferenceProfile ?? "balanced")
      : 512);
  const maxPromptLen = maxPromptTokensForGenerate(loaded.entry, loaded.tokenizer, maxNew);
  const inputs = loaded.tokenizer(prompt, {
    add_special_tokens: false,
    return_tensor: true,
    max_length: maxPromptLen,
    truncation: true,
  });

  let rawResult = "";
  let insideThinking = false;
  let insideToolCall = false;
  let hitStopToken = false;

  /**
   * Stream text out token-by-token. Strip ChatML / Gemma specials so they never reach the UI.
   * Stop early on `<|im_end|>` so WASM doesn't keep generating after the reply is done.
   */
  const streamer = new tf.TextStreamer(
    loaded.tokenizer as unknown as Parameters<typeof tf.TextStreamer>[0],
    {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function: (text: string) => {
        if (hitStopToken) return;
        rawResult += text;
        if (isStopSpecialTokenChunk(text) || text.includes("<|im_end|>") || text.includes("<|endoftext|>")) {
          hitStopToken = true;
          currentInterruptCriteria?.interrupt();
          return;
        }
        if (text.includes("<|channel>")) {
          insideThinking = true;
          return;
        }
        if (text.includes("<channel|>")) {
          insideThinking = false;
          return;
        }
        if (insideThinking) {
          return;
        }
        if (text.includes("<|tool_call>")) insideToolCall = true;
        if (text.includes("<tool_call|>") || text.includes("<tool_response|>")) {
          insideToolCall = false;
          return;
        }
        if (insideToolCall || text.includes("<|tool_response>")) return;
        const clean = stripSpecialTokens(text);
        if (clean) options?.onChunk?.(clean);
      },
    }
  );

  const interruptCriteria = new tf.InterruptableStoppingCriteria();
  currentInterruptCriteria = interruptCriteria;
  try {
    await loaded.model.generate({
      ...inputs,
      max_new_tokens: maxNew,
      do_sample: false,
      streamer,
      stopping_criteria: interruptCriteria,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      return { raw: rawResult, visible: stripSpecialTokens(rawResult) };
    }
    throw e;
  } finally {
    currentInterruptCriteria = null;
  }

  return { raw: rawResult, visible: stripSpecialTokens(rawResult) };
}

export async function generateLocalGemma(
  prompt: string,
  options?: GenerateLocalOptions
): Promise<{ raw: string; visible: string }> {
  const next = generateSerial.then(() => executeGenerateLocalGemma(prompt, options));
  generateSerial = next.then(
    () => undefined,
    () => undefined
  );
  return await next;
}

export async function countTokensLocalGemma(text: string): Promise<number> {
  if (!loaded) throw new Error("Local model is not loaded");
  const { input_ids } = loaded.tokenizer(text, { add_special_tokens: false });
  return input_ids.size;
}

export function currentLocalTokenizer(): LoadedLlm["tokenizer"] | null {
  return loaded?.tokenizer ?? null;
}
