import type { OpenRouterStreamCallbacks } from "@/lib/openrouter";

/** Local Gemma streaming + optional weight download progress (0–100; `null` = download finished). */
export type StreamLocalGemmaChatCallbacks = OpenRouterStreamCallbacks & {
  onModelDownloadProgress?: (percent: number | null) => void;
};
