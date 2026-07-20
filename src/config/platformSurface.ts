import { isDesktopApp } from "@/lib/isDesktopApp";
import type { AiProvider, ApiKeyConfig } from "@/types/chat";
import { DEFAULT_MODEL_ID, DEPRECATED_DEFAULT_MODEL_IDS } from "@/types/chat";

/** Browser deployment (not Electron). */
export function isWebClient(): boolean {
  return !isDesktopApp();
}

/** AI providers exposed in web Settings / setup. */
export const WEB_AI_PROVIDERS: readonly AiProvider[] = [
  "openrouter",
  "openai_compatible",
  "webgpu_gemma",
] as const;

/** Workspace routes hidden from web sidebar and redirected to home. */
export const DESKTOP_ONLY_WORKSPACE_PATHS = new Set<string>([
  "/labs",
  "/write",
  "/benchmark",
  "/webgpu",
]);

export function isWorkspacePathAllowedOnWeb(pathname: string): boolean {
  if (!isWebClient()) return true;
  return !DESKTOP_ONLY_WORKSPACE_PATHS.has(pathname);
}

export function isAiProviderAllowedOnWeb(provider: AiProvider): boolean {
  if (!isWebClient()) return true;
  return (WEB_AI_PROVIDERS as readonly string[]).includes(provider);
}

/** Downgrade desktop-only provider flags when config is loaded in the browser. */
export function coerceApiConfigForPlatform(cfg: ApiKeyConfig): ApiKeyConfig {
  if (!isWebClient()) return cfg;

  let next: ApiKeyConfig = { ...cfg };

  if (!isAiProviderAllowedOnWeb(next.aiProvider)) {
    next = {
      ...next,
      aiProvider: "openrouter",
      model:
        next.model && !next.model.startsWith("openbentt/") && next.aiProvider !== "webgpu_gemma"
          ? next.model
          : DEFAULT_MODEL_ID,
    };
  }

  if (next.aiProvider === "openrouter") {
    const modelStale =
      !next.model?.trim() || DEPRECATED_DEFAULT_MODEL_IDS.includes(next.model.trim());
    if (modelStale) {
      next = {
        ...next,
        model: DEFAULT_MODEL_ID,
        comparisonModelIds:
          next.comparisonModelIds.length > 0
            ? next.comparisonModelIds.map((id) =>
                DEPRECATED_DEFAULT_MODEL_IDS.includes(id) ? DEFAULT_MODEL_ID : id
              )
            : [DEFAULT_MODEL_ID],
      };
    }
  }

  return next;
}
