import { canSendChat, canSendMessage, type ApiKeyConfig } from "@/types/chat";
import { getLocalWeightsConsent } from "@/lib/gemmaWebGpu/localModelConsent";

export function getComposerPlaceholder(
  cfg: ApiKeyConfig,
  opts: {
    isLoadingConfig?: boolean;
    workspacePlaceholder?: string;
    comparisonEnabled?: boolean;
  } = {}
): string {
  if (opts.isLoadingConfig) return "Loading…";

  if (!canSendMessage(cfg)) {
    if (canSendChat(cfg) && cfg.aiProvider === "local_gguf") {
      return "Choose an installed GGUF in Settings → AI provider, or download one in Labs";
    }
  }

  if (!canSendChat(cfg)) {
    switch (cfg.aiProvider) {
      case "webgpu_gemma":
        return "Finish on-device setup above, or pick another provider in Settings";
      case "local_gguf":
        return "Open Labs → Local model hub to download a GGUF, then select it in Settings";
      case "openai_compatible":
        return "Set your local server URL in Settings (Ollama, LM Studio, …)";
      default:
        return "Add an API key in Settings to get started";
    }
  }

  if (cfg.aiProvider === "webgpu_gemma" && !getLocalWeightsConsent()) {
    return "Complete on-device model setup above before your first message";
  }

  if (opts.workspacePlaceholder) return opts.workspacePlaceholder;
  if (opts.comparisonEnabled ?? cfg.comparisonEnabled) {
    return "Same prompt goes to each selected model…";
  }
  return "Ask anything — attach images, audio, or files with the paperclip";
}
