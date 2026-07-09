import type { ApiKeyConfig } from "@/types/chat";
import type { StreamMetrics } from "@/lib/openrouter";
import type { StreamLocalGemmaChatCallbacks } from "@/lib/gemmaWebGpu/streamLocalGemmaTypes";
import {
  abortLocalGemmaGeneration,
  buildLocalPrompt,
  countTokensLocalGemma,
  currentLocalTokenizer,
  ensureLocalGemmaLoaded,
  generateLocalGemma,
} from "@/lib/gemmaWebGpu/localGemmaInference";
import { trimApiMessagesForLocal } from "@/lib/gemmaWebGpu/trimForLocalContext";
import type { LocalGemmaBackendPreference } from "@/lib/gemmaWebGpu/webGpuCaps";
import { stripSpecialTokens } from "@/lib/gemmaWebGpu/stripGemmaStreamChunk";
import { expandRuntimeInferenceMessage } from "@/lib/userFacingError";
import { isWebClient } from "@/config/platformSurface";

export { abortLocalGemmaGeneration } from "@/lib/gemmaWebGpu/localGemmaInference";

function enhanceWebGpuBackendError(err: unknown): Error {
  const original = err instanceof Error ? err.message.trim() : String(err);
  if (
    /no available backend|Failed to get GPU adapter|enable-unsafe-webgpu|\[webgpu\]|device failed at creation|requires f16 but the device does not support|exceeds the max buffer size limit|GPU buffer too small|WebGPU validation failed|Could not find an implementation for GatherBlockQuantized|can'?t create session|cannot create session|create.?session|ERROR_CODE:\s*6|error code\s*=?\s*6|bad_alloc|Failed to allocate/i.test(
      original
    )
  ) {
    return new Error(
      `${original}\n\n` +
        "Openbentt could not start the on-device model (WebGPU session failed, and CPU fallback also failed or was blocked). " +
        "Try: (1) hard-refresh this tab, (2) clear site data for this origin if a previous download was interrupted, " +
        "(3) use Chrome/Edge on localhost, (4) or switch to OpenRouter (cloud) in Settings. " +
        "Linux: update Mesa/Vulkan drivers; WebGPU is often flaky until Chromium can create a GPU device."
    );
  }
  const raw = expandRuntimeInferenceMessage(original);
  return err instanceof Error ? new Error(raw) : new Error(raw);
}

export async function streamLocalGemmaChat(
  cfg: ApiKeyConfig,
  apiMessages: Array<{ role: string; content: unknown }>,
  signal: AbortSignal,
  callbacks: StreamLocalGemmaChatCallbacks
): Promise<{ text: string; metrics: StreamMetrics; rateLimitHeaders: Record<string, string> }> {
  const t0 = performance.now();
  let ttftMs: number | null = null;
  let accumulated = "";

  const onInternalAbort = () => {
    abortLocalGemmaGeneration();
  };
  signal.addEventListener("abort", onInternalAbort);

  const profile = cfg.localInferenceProfile ?? "balanced";
  /**
   * Browser /chat: prefer WASM/CPU by default. Linux WebGPU often reports an adapter but
   * ORT fails with "Can't create session". Desktop Electron can keep `auto` (GPU first).
   * Performance profile still requests WebGPU first, with WASM fallback in ensureLocalGemmaLoaded.
   */
  const backendPreference: LocalGemmaBackendPreference = isWebClient()
    ? profile === "performance"
      ? "auto"
      : "wasm"
    : "auto";
  const scopedMessages = trimApiMessagesForLocal(apiMessages, profile);

  try {
    /** Keep the bar visible from the first moment (HF import + cache check can take seconds). */
    callbacks.onModelDownloadProgress?.(0);
    await ensureLocalGemmaLoaded(
      cfg.model,
      (pct) => {
        callbacks.onModelDownloadProgress?.(Math.min(100, Math.max(0, pct)));
      },
      signal,
      {
        backendPreference,
        onBackendPicked: (backend) => callbacks.onBackendPicked?.(backend),
        onModelAutoSwitched: (info) => callbacks.onModelAutoSwitched?.(info),
        onDtypeFallback: (info) => callbacks.onDtypeFallback?.(info),
      }
    );
    callbacks.onModelDownloadProgress?.(null);

    const tokenizer = currentLocalTokenizer();
    const prompt = tokenizer
      ? buildLocalPrompt(tokenizer, scopedMessages)
      : /** Tokenizer should exist once `ensureLocalGemmaLoaded` resolves; guard is belt-and-braces. */
        scopedMessages.map((m) => `${m.role}: ${String(m.content ?? "")}`).join("\n");

    let promptTokens: number | undefined;
    try {
      promptTokens = await countTokensLocalGemma(prompt);
      callbacks.onUsage?.({ prompt_tokens: promptTokens });
    } catch {
      /* optional */
    }

    const { raw, visible } = await generateLocalGemma(prompt, {
      inferenceProfile: profile,
      onChunk: (piece) => {
        if (ttftMs == null && piece.length > 0) ttftMs = Math.round(performance.now() - t0);
        accumulated += piece;
        callbacks.onDelta(piece);
      },
    });

    const finalText = stripSpecialTokens(
      accumulated.length > 0 ? accumulated : stripSpecialTokens(visible) || stripSpecialTokens(raw)
    );
    const completionTokens = Math.max(0, Math.ceil(finalText.length / 4));
    callbacks.onUsage?.({
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: (promptTokens ?? 0) + completionTokens,
    });

    const totalMs = Math.round(performance.now() - t0);
    return {
      text: finalText,
      metrics: {
        ttftMs,
        totalMs,
        promptTokens,
        completionTokens,
        totalTokens: promptTokens != null ? promptTokens + completionTokens : undefined,
      },
      rateLimitHeaders: {},
    };
  } catch (e) {
    callbacks.onModelDownloadProgress?.(null);
    throw enhanceWebGpuBackendError(e);
  } finally {
    signal.removeEventListener("abort", onInternalAbort);
  }
}
