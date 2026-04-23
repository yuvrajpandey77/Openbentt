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
import { stripSpecialTokens } from "@/lib/gemmaWebGpu/stripGemmaStreamChunk";
import { chatCompletionMessagesToGemmaPrompt } from "@/lib/gemmaWebGpu/gemmaPrompt";
import type { LocalInferenceProfile } from "@/types/chat";

type HF = typeof import("@huggingface/transformers");

let hfPromise: Promise<HF> | null = null;

/**
 * Do not override `env.backends.onnx.wasm.wasmPaths`: `@huggingface/transformers` pins a matching
 * `onnxruntime-web` (e.g. 1.25.x-dev) and sets CDN paths internally. Forcing older `public/ort` (1.20)
 * or mismatched JSEP URLs causes runtime errors such as `webgpuInit is not a function`.
 */
async function getTransformers(): Promise<HF> {
  if (!hfPromise) {
    hfPromise = import("@huggingface/transformers");
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
  return /Could not find an implementation|no available backend|Failed to get GPU adapter|GPU buffer too small|exceeds the max buffer size limit|WebGPU validation failed|requires f16 but the device does not support|Device failed at creation/i.test(
    msg
  );
}

/** Lightest ordering of fallback dtypes per device, tried in sequence on recoverable errors. */
function dtypeCascade(initial: LocalGemmaBackend): LocalGemmaDtype[] {
  if (initial.device === "webgpu") {
    /** q4f16 needs shader-f16; q4 works on any GPU; fp16 is the last-resort CPU-safe format. */
    const base: LocalGemmaDtype[] = initial.dtype === "q4f16" ? ["q4f16", "q4"] : ["q4"];
    return [...base, "fp16"];
  }
  /** WASM path: only fp16 is broadly supported (CPU has no GatherBlockQuantized kernel). */
  return ["fp16"];
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
    const progress_callback = (info: { status: string; file?: string; progress?: number }) => {
      if (info.status === "progress" && info.file != null) {
        fileProgress.set(info.file, info.progress ?? 0);
        const values = [...fileProgress.values()];
        const overall = Math.round(values.reduce((a, b) => a + b, 0) / Math.max(values.length, 1));
        if (overall !== lastReported) {
          lastReported = overall;
          onProgress(overall);
        }
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
     * Try the planned (entry, backend) combo. If it still fails after the dtype cascade – e.g. a
     * user-forced WebGPU choice that the GPU actually can't serve – fall through to the tiny model
     * as the last safety net (WASM fp16 is ~500 MB download and runs on any CPU).
     */
    try {
      loaded = await tryLoad(plan.modelEntry, plan.backend);
    } catch (e) {
      if (!isRecoverableLoadError(e) || plan.modelEntry.storedId === FALLBACK_TINY_LOCAL_MODEL_ID) {
        throw e;
      }
      const tiny = findLocalModelEntry(FALLBACK_TINY_LOCAL_MODEL_ID);
      if (!tiny) throw e;
      options?.onModelAutoSwitched?.({
        from: plan.modelEntry,
        to: tiny,
        reason: "gpu-buffer",
      });
      const tinyBackend: LocalGemmaBackend =
        plan.backend.device === "webgpu"
          ? { device: "webgpu", dtype: "q4", reason: plan.backend.reason }
          : { device: "wasm", dtype: "fp16", reason: plan.backend.reason };
      loaded = await tryLoad(tiny, tinyBackend);
    }

    if (signal.aborted) {
      await unloadLocalGemma();
      throw new DOMException("Aborted", "AbortError");
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
      return Math.min(320, Math.max(96, Math.floor(b * 0.35)));
    case "balanced":
      return Math.min(1024, Math.floor(b * 0.75));
    case "performance":
    default:
      return b;
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
  const cleaned = apiMessages.map((m) => ({
    role: m.role,
    content: flattenContent(m.content),
  }));
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
  return chatCompletionMessagesToGemmaPrompt(apiMessages);
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

  /**
   * Stream text out token-by-token. Qwen / Llama lack Gemma's `<|channel>` / `<|tool_call>` tokens,
   * so those branches simply never fire for those models. `stripSpecialTokens` is safe for both.
   */
  const streamer = new tf.TextStreamer(
    loaded.tokenizer as unknown as Parameters<typeof tf.TextStreamer>[0],
    {
      skip_prompt: true,
      skip_special_tokens: false,
      callback_function: (text: string) => {
        rawResult += text;
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
