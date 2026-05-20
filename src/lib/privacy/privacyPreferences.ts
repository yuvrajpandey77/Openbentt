/**
 * Privacy preferences — non-secret toggles stored in localStorage.
 */
import { PRIVACY_PREFS_KEY } from "@/lib/storageMigrate";
import type { AiProvider } from "@/types/chat";
import { isDesktopApp } from "@/lib/isDesktopApp";

export interface PrivacyPreferences {
  /** Block cloud inference providers and outbound model APIs. */
  localOnlyMode: boolean;
  /** Explicit opt-in before OpenRouter / vendor APIs / remote compatible bases (non-loopback). */
  cloudInferenceOptIn: boolean;
  /** Vercel Analytics — off unless user enables. */
  analyticsEnabled: boolean;
  /** Allow copying share URLs that embed chat content in the location hash. */
  allowShareLinks: boolean;
  /** Warn when research or embeddings download from the public internet. */
  showNetworkActivityWarnings: boolean;
}

const CLOUD_PROVIDERS: ReadonlySet<AiProvider> = new Set([
  "openrouter",
  "openai_direct",
  "openai_compatible",
  "anthropic",
  "google",
]);

export function defaultPrivacyPreferences(): PrivacyPreferences {
  return {
    localOnlyMode: isDesktopApp(),
    cloudInferenceOptIn: !isDesktopApp(),
    analyticsEnabled: false,
    allowShareLinks: !isDesktopApp(),
    showNetworkActivityWarnings: true,
  };
}

export function loadPrivacyPreferences(): PrivacyPreferences {
  const base = defaultPrivacyPreferences();
  try {
    const raw = localStorage.getItem(PRIVACY_PREFS_KEY);
    if (!raw) return base;
    const j = JSON.parse(raw) as Partial<PrivacyPreferences>;
    return {
      localOnlyMode: typeof j.localOnlyMode === "boolean" ? j.localOnlyMode : base.localOnlyMode,
      cloudInferenceOptIn:
        typeof j.cloudInferenceOptIn === "boolean" ? j.cloudInferenceOptIn : base.cloudInferenceOptIn,
      analyticsEnabled: typeof j.analyticsEnabled === "boolean" ? j.analyticsEnabled : base.analyticsEnabled,
      allowShareLinks: typeof j.allowShareLinks === "boolean" ? j.allowShareLinks : base.allowShareLinks,
      showNetworkActivityWarnings:
        typeof j.showNetworkActivityWarnings === "boolean"
          ? j.showNetworkActivityWarnings
          : base.showNetworkActivityWarnings,
    };
  } catch {
    return base;
  }
}

export function savePrivacyPreferences(prefs: PrivacyPreferences): void {
  try {
    localStorage.setItem(PRIVACY_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* quota */
  }
}

export function isCloudAiProvider(provider: AiProvider): boolean {
  return CLOUD_PROVIDERS.has(provider);
}

export function isLoopbackCompatibleBase(url: string): boolean {
  const t = url.trim();
  if (!t) return false;
  try {
    const u = new URL(t);
    return u.hostname === "127.0.0.1" || u.hostname === "localhost" || u.hostname === "::1";
  } catch {
    return false;
  }
}

/** Whether the selected provider may send prompts to a remote inference API. */
export function isCloudInferenceAllowed(
  provider: AiProvider,
  openAiCompatibleBaseUrl: string,
  prefs: PrivacyPreferences = loadPrivacyPreferences()
): boolean {
  if (!isCloudAiProvider(provider)) return true;
  if (provider === "openai_compatible" && isLoopbackCompatibleBase(openAiCompatibleBaseUrl)) {
    return true;
  }
  if (prefs.localOnlyMode) return false;
  if (!prefs.cloudInferenceOptIn) return false;
  return true;
}

export function isNetworkResearchAllowed(
  prefs: PrivacyPreferences = loadPrivacyPreferences(),
  offlineFirst?: boolean
): boolean {
  if (offlineFirst) return false;
  return !prefs.localOnlyMode;
}

export function isShareLinkAllowed(prefs: PrivacyPreferences = loadPrivacyPreferences()): boolean {
  if (prefs.localOnlyMode) return false;
  return prefs.allowShareLinks;
}

export function isAnalyticsAllowed(prefs: PrivacyPreferences = loadPrivacyPreferences()): boolean {
  return prefs.analyticsEnabled;
}
