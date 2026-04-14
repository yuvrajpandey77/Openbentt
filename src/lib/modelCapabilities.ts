/**
 * Modality hints: prefer OpenRouter `/models` metadata when present, else id heuristics.
 */

import type { OpenRouterModel } from "@/lib/openrouter";

export interface ModelCapabilities {
  text: boolean;
  vision: boolean;
  audioIn: boolean;
  audioOut: boolean;
  /** Likely chain-of-thought / reasoning-tuned (heuristic). */
  reasoningHeavy: boolean;
  /** From API when available. */
  source: "openrouter" | "heuristic";
}

const VISION_RE =
  /vision|4o|4-turbo|gpt-4(?!32)|claude-3|claude-sonnet|claude-opus|gemini|gemma|llava|qwen.*vl|pixtral|moondream|internvl|multimodal|image/i;

const AUDIO_IN_RE = /whisper|audio|speech|tts|transcribe|ultravox/i;

const AUDIO_OUT_RE = /tts|audio|speech|talk|voice|realtime|audio-preview/i;

const REASONING_RE = /^o[134]|o1|o3|deepseek-r1|qwq|think|reasoning|grok-3|claude-opus-4/i;

function fromOpenRouterArchitecture(meta: OpenRouterModel): Partial<ModelCapabilities> | null {
  const arch = meta.architecture;
  if (!arch) return null;
  const ins = arch.input_modalities ?? [];
  const outs = arch.output_modalities ?? [];
  const mod = typeof arch.modality === "string" ? arch.modality.toLowerCase() : "";
  const vision =
    ins.includes("image") ||
    outs.includes("image") ||
    mod.includes("multimodal") ||
    mod.includes("image");
  const audioIn = ins.some((m) => /audio|voice|sound/i.test(m));
  const audioOut = outs.some((m) => /audio|voice|sound/i.test(m));
  return { vision, audioIn, audioOut };
}

export function inferModelCapabilities(modelId: string, meta?: OpenRouterModel | null): ModelCapabilities {
  const id = modelId.trim();
  const lower = id.toLowerCase();

  const apiLayer = meta?.architecture ? fromOpenRouterArchitecture(meta) : null;

  return {
    text: true,
    vision: apiLayer?.vision ?? VISION_RE.test(lower),
    audioIn: apiLayer?.audioIn ?? AUDIO_IN_RE.test(lower),
    audioOut: apiLayer?.audioOut ?? AUDIO_OUT_RE.test(lower),
    reasoningHeavy: REASONING_RE.test(lower) || /r1|thinking/i.test(lower),
    source: meta?.architecture ? "openrouter" : "heuristic",
  };
}

export function capabilitySummary(c: ModelCapabilities): string {
  const bits: string[] = ["Text"];
  if (c.vision) bits.push("vision");
  if (c.audioIn) bits.push("audio in");
  if (c.audioOut) bits.push("audio out");
  if (c.reasoningHeavy) bits.push("reasoning-style");
  return bits.join(" · ");
}
