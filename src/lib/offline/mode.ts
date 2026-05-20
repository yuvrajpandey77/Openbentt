import type { ApiKeyConfig } from "@/types/chat";
import {
  isCloudInferenceAllowed,
  isNetworkResearchAllowed,
  loadPrivacyPreferences,
  type PrivacyPreferences,
} from "@/lib/privacy/privacyPreferences";
import { isCloudAiProvider } from "@/lib/modelManager/availability";

export class OfflineBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OfflineBlockedError";
  }
}

/** True when the app should refuse outbound cloud inference (privacy local-only or browser offline). */
export function isOfflineFirstActive(
  cfg?: ApiKeyConfig,
  navigatorOffline?: boolean,
  prefs: PrivacyPreferences = loadPrivacyPreferences()
): boolean {
  if (prefs.localOnlyMode) return true;
  return navigatorOffline === true;
}

/**
 * Assert that a cloud/network operation is allowed.
 * Throws {@link OfflineBlockedError} when blocked — never silently calls cloud.
 */
export function assertCloudCallAllowed(
  cfg: ApiKeyConfig,
  context: string,
  navigatorOffline?: boolean,
  prefs: PrivacyPreferences = loadPrivacyPreferences()
): void {
  if (prefs.localOnlyMode) {
    throw new OfflineBlockedError(
      `Local-only mode blocked ${context}. Change Privacy → Local-only mode, or use on-device / GGUF / localhost Ollama.`
    );
  }
  if (navigatorOffline) {
    throw new OfflineBlockedError(
      `No network connection — blocked ${context}. Reconnect or use local models.`
    );
  }
}

/** Block cloud chat providers when local-only or browser offline. */
export function assertChatProviderAllowed(
  cfg: ApiKeyConfig,
  navigatorOffline?: boolean,
  prefs: PrivacyPreferences = loadPrivacyPreferences()
): void {
  if (navigatorOffline && isCloudAiProvider(cfg.aiProvider)) {
    throw new OfflineBlockedError(
      "No network: cloud chat providers unavailable. Use on-device, GGUF, or loopback Ollama."
    );
  }
  if (!isCloudAiProvider(cfg.aiProvider)) return;
  if (!isCloudInferenceAllowed(cfg.aiProvider, cfg.openAiCompatibleBaseUrl, prefs)) {
    throw new OfflineBlockedError(
      "Local-only mode or cloud opt-in disabled this provider. Use Settings → Privacy or switch to a local provider."
    );
  }
}

/** Research fetches require network and local-only off. */
export function isResearchNetworkAllowed(
  cfg?: ApiKeyConfig,
  navigatorOffline?: boolean,
  prefs: PrivacyPreferences = loadPrivacyPreferences()
): boolean {
  if (!isNetworkResearchAllowed(prefs)) return false;
  if (navigatorOffline) return false;
  return true;
}

export type ConnectivityState = "online" | "offline" | "offline_first";

export function connectivityState(
  navigatorOffline: boolean,
  prefs: PrivacyPreferences = loadPrivacyPreferences()
): ConnectivityState {
  if (prefs.localOnlyMode) return "offline_first";
  return navigatorOffline ? "offline" : "online";
}

export function connectivityLabel(state: ConnectivityState): string {
  switch (state) {
    case "offline_first":
      return "Local-only (privacy)";
    case "offline":
      return "Offline (no network)";
    default:
      return "Online";
  }
}
