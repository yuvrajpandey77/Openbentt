import { canSendChat, type ApiKeyConfig } from "@/types/chat";
import type { OpenCodeLayerSnapshot } from "@/lib/agent/openCodeChat";

/** True when the app can chat without forcing an OpenRouter key. */
export function isChatSurfaceReady(
  apiConfig: ApiKeyConfig,
  openCodeLayer: Pick<
    OpenCodeLayerSnapshot,
    "available" | "askReady" | "opencodeInstalled" | "checking"
  >,
  localAIHealth?: string
): boolean {
  if (canSendChat(apiConfig)) return true;
  const layer =
    openCodeLayer.available ||
    openCodeLayer.askReady ||
    openCodeLayer.opencodeInstalled ||
    openCodeLayer.checking;
  if (layer) return true;
  if (localAIHealth === "ready" || localAIHealth === "checking" || localAIHealth === "no-models") {
    return true;
  }
  return false;
}
