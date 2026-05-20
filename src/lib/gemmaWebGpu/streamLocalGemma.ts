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

export { abortLocalGemmaGeneration } from "@/lib/gemmaWebGpu/localGemmaInference";

function enhanceWebGpuBackendError(err: unknown): Error {
  const original = err instanceof Error ? err.message.trim() : String(err);
  if (
    /no available backend|Failed to get GPU adapter|enable-unsafe-webgpu|\[webgpu\]|device failed at creation|requires f16 but the device does not support|exceeds the max buffer size limit|GPU buffer too small|WebGPU validation failed|Could not find an implementation for GatherBlockQuantized/i.test(
      original
    )
  ) {
    return new Error(
      `${original}\n\n` +
        "Openbentt tried the available fallbacks (smaller model → WASM/CPU) and still couldn't start. " +
        "Desktop: fully quit and relaunch (Electron enables WebGPU-related Chromium flags). " +
        "Browser: launch Chrome/Edge with --enable-unsafe-webgpu, or enable the WebGPU flag in chrome://flags. " +
        "Linux: install/update Mesa and Vulkan drivers; \"Device failed at creation\" usually clears after a desktop-build restart."
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
  const backendPreference: LocalGemmaBackendPreference =
    profile === "performance" ? "webgpu" : "auto";
  const scopedMessages = trimApiMessagesForLocal(apiMessages, profile);

  try {
    callbacks.onModelDownloadProgress?.(0);
    await ensureLocalGemmaLoaded(
      cfg.model,
      (pct) => {
        callbacks.onModelDownloadProgress?.(pct);
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
