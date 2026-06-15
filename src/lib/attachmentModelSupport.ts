import { inferModelCapabilities } from "@/lib/modelCapabilities";
import type { OpenRouterModel } from "@/lib/openrouter";
import type { ApiKeyConfig, MessageAttachment } from "@/types/chat";

/** Attachments that need a vision-capable model endpoint. */
export function attachmentRequiresVision(att: MessageAttachment): boolean {
  return att.kind === "image" || att.kind === "video_frame";
}

/** Whether the active provider/model can accept image parts in the API request. */
export function modelSupportsImages(cfg: ApiKeyConfig, meta?: OpenRouterModel | null): boolean {
  if (cfg.aiProvider === "webgpu_gemma" || cfg.aiProvider === "local_gguf") return false;
  if (cfg.model.trim() === "openrouter/free") return false;
  return inferModelCapabilities(cfg.model, meta).vision;
}

export function imageUnsupportedMessage(modelId: string): string {
  const label = modelId.trim() || "this model";
  return `${label} does not support images. Switch to a vision-capable model in the + menu → Model.`;
}

export function findUnsupportedVisionAttachments(
  attachments: MessageAttachment[],
  cfg: ApiKeyConfig,
  meta?: OpenRouterModel | null
): MessageAttachment[] {
  if (modelSupportsImages(cfg, meta)) return [];
  return attachments.filter(attachmentRequiresVision);
}
