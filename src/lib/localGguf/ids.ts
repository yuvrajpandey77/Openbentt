/** Stored in `ApiKeyConfig.model` when `aiProvider === "local_gguf"`. */
export const GGUF_MODEL_PREFIX = "openbentt/gguf:" as const;

export function isLocalGgufModelId(model: string | undefined | null): boolean {
  return typeof model === "string" && model.startsWith(GGUF_MODEL_PREFIX);
}

export const GGUF_MODEL_NONE = "openbentt/gguf:none" as const;

/** Registry UUID from `openbentt/gguf:<uuid>`; `'none'` = not configured. */
export function parseGgufRegistryId(model: string): string | null {
  if (!isLocalGgufModelId(model)) return null;
  const id = model.slice(GGUF_MODEL_PREFIX.length).trim();
  if (id === "none") return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
    ? id
    : null;
}

export function buildGgufModelId(registryId: string): string {
  return `${GGUF_MODEL_PREFIX}${registryId}`;
}
