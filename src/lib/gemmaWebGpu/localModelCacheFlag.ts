import { LOCAL_TINY_MODEL_ID } from "@/lib/gemmaWebGpu/models";

const CACHED_KEY = "openbentt-local-model-cached-v1";

/** Persist that weights for this model id finished loading at least once (browser Cache API). */
export function markLocalModelCached(storedId: string = LOCAL_TINY_MODEL_ID): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(CACHED_KEY, storedId);
  } catch {
    /* private mode */
  }
}

export function getCachedLocalModelId(): string | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const v = localStorage.getItem(CACHED_KEY);
    return v?.trim() || null;
  } catch {
    return null;
  }
}

export function isLocalModelMarkedCached(storedId: string = LOCAL_TINY_MODEL_ID): boolean {
  return getCachedLocalModelId() === storedId;
}

export function clearLocalModelCachedFlag(): void {
  try {
    localStorage.removeItem(CACHED_KEY);
  } catch {
    /* ignore */
  }
}
