import { canSendChat, canSendMessage, type ApiKeyConfig } from "@/types/chat";

export function getComposerPlaceholder(
  cfg: ApiKeyConfig,
  opts: {
    isLoadingConfig?: boolean;
    workspacePlaceholder?: string;
    comparisonEnabled?: boolean;
    /** Web /chat — shorter placeholder */
    webChat?: boolean;
    /** Ollama (or other local) is ready even if cloud key is missing */
    localReady?: boolean;
  } = {}
): string {
  if (opts.isLoadingConfig) return "Loading…";

  if (opts.localReady && !canSendChat(cfg)) {
    return "Message…";
  }

  if (!canSendMessage(cfg)) {
    if (canSendChat(cfg) && cfg.aiProvider === "local_gguf") {
      return "Pick a GGUF model in Settings";
    }
  }

  if (!canSendChat(cfg)) {
    switch (cfg.aiProvider) {
      case "local_gguf":
        return "Download a GGUF in Settings, then select it";
      case "openai_compatible":
        return "Start Ollama (or set a local server URL in Settings)";
      default:
        return "Add a cloud API key — or use Ollama / desktop local models";
    }
  }

  if (opts.workspacePlaceholder) return opts.workspacePlaceholder;
  if (opts.comparisonEnabled ?? cfg.comparisonEnabled) {
    return "Message all selected models…";
  }
  if (opts.webChat) return "Message…";
  return "Message…";
}