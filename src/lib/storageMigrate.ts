/**
 * One-time migration from legacy `cogerphere-*` localStorage keys to `openbentt-*`.
 * Call once at app startup (see main.tsx) before any UI reads persisted state.
 */

export const LOCAL_STORAGE_KEYS = {
  CHATS: "openbentt-chats",
  CURRENT_CHAT_ID: "openbentt-current-chat-id",
  API_CONFIG: "openbentt-api-config",
} as const;

const LEGACY_CHAT_KEYS = {
  CHATS: "cogerphere-chats",
  CURRENT_CHAT_ID: "cogerphere-current-chat-id",
  API_CONFIG: "cogerphere-api-config",
} as const;

const LEGACY_PRESETS = "cogerphere-experiment-presets";
export const EXPERIMENT_PRESETS_KEY = "openbentt-experiment-presets";

const LEGACY_SIDEBAR = "cogerphere-sidebar-collapsed";
export const SIDEBAR_COLLAPSED_KEY = "openbentt-sidebar-collapsed";

/** Privacy toggles (local-only, analytics, cloud opt-in) — not secrets. */
export const PRIVACY_PREFS_KEY = "openbentt-privacy-v1";

function copyIfMissing(newKey: string, oldKey: string): void {
  try {
    if (localStorage.getItem(newKey) != null) return;
    const v = localStorage.getItem(oldKey);
    if (v != null) {
      localStorage.setItem(newKey, v);
      localStorage.removeItem(oldKey);
    }
  } catch {
    /* private mode / quota */
  }
}

/** Migrate chats, current id, API config, presets, sidebar flag. */
export function migrateAllLegacyStorage(): void {
  (Object.keys(LEGACY_CHAT_KEYS) as (keyof typeof LEGACY_CHAT_KEYS)[]).forEach((k) => {
    copyIfMissing(LOCAL_STORAGE_KEYS[k], LEGACY_CHAT_KEYS[k]);
  });
  copyIfMissing(EXPERIMENT_PRESETS_KEY, LEGACY_PRESETS);
  copyIfMissing(SIDEBAR_COLLAPSED_KEY, LEGACY_SIDEBAR);
}
