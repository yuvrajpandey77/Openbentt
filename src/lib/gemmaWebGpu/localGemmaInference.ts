import { hfRepoIdForStoredModel } from "@/lib/gemmaWebGpu/models";
import { stripSpecialTokens } from "@/lib/gemmaWebGpu/stripGemmaStreamChunk";

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

/** Loaded `Gemma4ForConditionalGeneration` instance (dispose() on unload). */
let loadDisposable: { dispose: () => Promise<void> } | null = null;
let processor: Awaited<ReturnType<HF["AutoProcessor"]["from_pretrained"]>> | null = null;
let loadedRepoId: string | null = null;
/** Serializes loads so concurrent callers (e.g. model switch) run in order. */
let loadChain: Promise<void> = Promise.resolve();
let abortController: AbortController | null = null;

export function abortLocalGemmaGeneration(): void {
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
}

export async function unloadLocalGemma(): Promise<void> {
  abortLocalGemmaGeneration();
  if (loadDisposable) {
    await loadDisposable.dispose().catch(() => {});
    loadDisposable = null;
  }
  processor = null;
  loadedRepoId = null;
}

export function isLocalGemmaWeightsLoaded(): boolean {
  return loadDisposable != null && processor != null;
}

export async function ensureLocalGemmaLoaded(
  storedModelId: string,
  onProgress: (pct: number) => void,
  signal: AbortSignal
): Promise<void> {
  const repoId = hfRepoIdForStoredModel(storedModelId);
  if (loadDisposable && processor && loadedRepoId === repoId) {
    return;
  }

  const run = async () => {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    if (loadDisposable && loadedRepoId === repoId) return;
    if (loadedRepoId !== repoId) {
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

    const [model, proc] = await Promise.all([
      tf.Gemma4ForConditionalGeneration.from_pretrained(repoId, {
        dtype: "q4f16",
        device: "webgpu",
        progress_callback,
      }),
      tf.AutoProcessor.from_pretrained(repoId),
    ]);

    if (signal.aborted) {
      await model.dispose().catch(() => {});
      throw new DOMException("Aborted", "AbortError");
    }

    loadDisposable = model;
    processor = proc;
    loadedRepoId = repoId;
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

export interface GenerateLocalOptions {
  maxTokens?: number;
  onChunk?: (text: string) => void;
}

export async function generateLocalGemma(
  prompt: string,
  options?: GenerateLocalOptions
): Promise<{ raw: string; visible: string }> {
  if (!loadDisposable || !processor) {
    throw new Error("Local Gemma model is not loaded");
  }

  const tf = await getTransformers();
  const model = loadDisposable as Awaited<ReturnType<HF["Gemma4ForConditionalGeneration"]["from_pretrained"]>>;

  const inputs = processor.tokenizer(prompt, {
    add_special_tokens: false,
    return_tensor: "pt",
  });

  let rawResult = "";
  let insideThinking = false;
  let insideToolCall = false;

  const streamer = new tf.TextStreamer(processor.tokenizer, {
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
  });

  abortController = new AbortController();
  try {
    await model.generate({
      ...inputs,
      max_new_tokens: options?.maxTokens ?? 1024,
      do_sample: false,
      streamer,
      abort_signal: abortController.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      return { raw: rawResult, visible: stripSpecialTokens(rawResult) };
    }
    throw e;
  } finally {
    abortController = null;
  }

  return { raw: rawResult, visible: stripSpecialTokens(rawResult) };
}

export async function countTokensLocalGemma(text: string): Promise<number> {
  if (!processor) throw new Error("Local Gemma model is not loaded");
  const { input_ids } = processor.tokenizer(text, { add_special_tokens: false });
  return input_ids.size;
}
