import type { ApiKeyConfig } from "@/types/chat";
import type { StreamMetrics } from "@/lib/openrouter";
import type { StreamLocalGemmaChatCallbacks } from "@/lib/gemmaWebGpu/streamLocalGemmaTypes";
import { chatCompletionMessagesToGemmaPrompt } from "@/lib/gemmaWebGpu/gemmaPrompt";
import {
  abortLocalGemmaGeneration,
  ensureLocalGemmaLoaded,
  generateLocalGemma,
  countTokensLocalGemma,
} from "@/lib/gemmaWebGpu/localGemmaInference";
import { stripSpecialTokens } from "@/lib/gemmaWebGpu/stripGemmaStreamChunk";
import { expandNumericRuntimeMessage } from "@/lib/userFacingError";

export { abortLocalGemmaGeneration } from "@/lib/gemmaWebGpu/localGemmaInference";

function enhanceWebGpuBackendError(err: unknown): Error {
  const original = err instanceof Error ? err.message.trim() : String(err);
  if (
    /no available backend|Failed to get GPU adapter|enable-unsafe-webgpu|\[webgpu\]/i.test(original)
  ) {
    return new Error(
      `${original}\n\n` +
        "Openbentt desktop: fully quit and relaunch the app (Electron enables WebGPU-related Chromium flags). " +
        "Browser: try launching Chrome/Edge with flag --enable-unsafe-webgpu, or enable the WebGPU / unsafe WebGPU flag in chrome://flags. " +
        "Linux: update Mesa/Vulkan GPU drivers if the adapter still fails."
    );
  }
  const raw = expandNumericRuntimeMessage(original);
  return err instanceof Error ? new Error(raw) : new Error(raw);
}

export async function streamLocalGemmaChat(
  cfg: ApiKeyConfig,
  apiMessages: Array<{ role: string; content: unknown }>,
  signal: AbortSignal,
  callbacks: StreamLocalGemmaChatCallbacks
): Promise<{ text: string; metrics: StreamMetrics; rateLimitHeaders: Record<string, string> }> {
  if (typeof navigator === "undefined" || !navigator.gpu) {
    throw new Error("WebGPU is not available in this environment. Try Chrome/Edge or the desktop app, or switch to a cloud provider in Settings.");
  }

  const t0 = performance.now();
  let ttftMs: number | null = null;
  let accumulated = "";

  const onInternalAbort = () => {
    abortLocalGemmaGeneration();
  };
  signal.addEventListener("abort", onInternalAbort);

  try {
    callbacks.onModelDownloadProgress?.(0);
    await ensureLocalGemmaLoaded(
      cfg.model,
      (pct) => {
        callbacks.onModelDownloadProgress?.(pct);
      },
      signal
    );
    callbacks.onModelDownloadProgress?.(null);

    const prompt = chatCompletionMessagesToGemmaPrompt(apiMessages);
    let promptTokens: number | undefined;
    try {
      promptTokens = await countTokensLocalGemma(prompt);
      callbacks.onUsage?.({ prompt_tokens: promptTokens });
    } catch {
      /* optional */
    }

    const { raw, visible } = await generateLocalGemma(prompt, {
      maxTokens: 1024,
      onChunk: (piece) => {
        if (ttftMs == null && piece.length > 0) ttftMs = Math.round(performance.now() - t0);
        accumulated += piece;
        callbacks.onDelta(piece);
      },
    });

    const finalText = accumulated.length > 0 ? accumulated : stripSpecialTokens(visible) || stripSpecialTokens(raw);
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
