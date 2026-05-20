/**
 * Desktop credential bridge — OS-backed vault via preload (never localStorage).
 */
import type { ApiKeyConfig } from "@/types/chat";
import { isDesktopApp } from "@/lib/isDesktopApp";

export type VaultKey = "provider_api_key" | "brave_search_api_key";

export interface VaultStatus {
  stored: Record<string, boolean>;
  encryptionAvailable: boolean;
}

export interface VaultLoadResult {
  providerApiKey: string;
  braveSearchApiKey: string;
}

export interface OpenbenttSecretsApi {
  status(): Promise<VaultStatus>;
  load(): Promise<VaultLoadResult>;
  set(key: VaultKey, value: string): Promise<{ ok: boolean }>;
  clear(key: VaultKey): Promise<{ ok: boolean }>;
}

export function getSecretsApi(): OpenbenttSecretsApi | undefined {
  return typeof window !== "undefined" ? window.openbenttSecrets : undefined;
}

/** Strip secrets before writing api config to localStorage on desktop. */
export function apiConfigForBrowserStorage(cfg: ApiKeyConfig): ApiKeyConfig {
  if (!isDesktopApp()) return cfg;
  return {
    ...cfg,
    apiKey: "",
    braveSearchApiKey: "",
    huggingFaceToken: "",
  };
}

export async function loadDesktopSecretsIntoConfig(cfg: ApiKeyConfig): Promise<ApiKeyConfig> {
  const api = getSecretsApi();
  if (!api?.load) return cfg;
  try {
    const { providerApiKey, braveSearchApiKey } = await api.load();
    return {
      ...cfg,
      apiKey: providerApiKey?.trim() || cfg.apiKey,
      braveSearchApiKey: braveSearchApiKey?.trim() || cfg.braveSearchApiKey,
    };
  } catch {
    return cfg;
  }
}

export async function persistDesktopSecretsFromConfig(cfg: ApiKeyConfig): Promise<void> {
  const api = getSecretsApi();
  if (!api?.set) return;
  const tasks: Promise<unknown>[] = [];
  if (cfg.apiKey.trim()) {
    tasks.push(api.set("provider_api_key", cfg.apiKey.trim()));
  }
  if (cfg.braveSearchApiKey.trim()) {
    tasks.push(api.set("brave_search_api_key", cfg.braveSearchApiKey.trim()));
  }
  await Promise.all(tasks);
}

/** Move legacy plaintext keys from parsed localStorage config into the vault. */
export async function migrateLegacySecretsFromConfig(parsed: Partial<ApiKeyConfig>): Promise<{
  config: Partial<ApiKeyConfig>;
  migrated: boolean;
}> {
  if (!isDesktopApp()) return { config: parsed, migrated: false };
  const api = getSecretsApi();
  if (!api?.set) return { config: parsed, migrated: false };

  let migrated = false;
  const next = { ...parsed };

  const apiKey = typeof parsed.apiKey === "string" ? parsed.apiKey.trim() : "";
  if (apiKey) {
    await api.set("provider_api_key", apiKey);
    next.apiKey = "";
    migrated = true;
  }

  const brave = typeof parsed.braveSearchApiKey === "string" ? parsed.braveSearchApiKey.trim() : "";
  if (brave) {
    await api.set("brave_search_api_key", brave);
    next.braveSearchApiKey = "";
    migrated = true;
  }

  return { config: next, migrated };
}
