import { describe, it, expect } from "vitest";
import {
  attachmentRequiresVision,
  findUnsupportedVisionAttachments,
  modelSupportsImages,
} from "./attachmentModelSupport";
import { normalizeApiConfig } from "@/types/chat";

describe("attachmentModelSupport", () => {
  it("treats openrouter/free as text-only for images", () => {
    const cfg = normalizeApiConfig({
      aiProvider: "openrouter",
      apiKey: "sk-test",
      model: "openrouter/free",
    });
    expect(modelSupportsImages(cfg)).toBe(false);
  });

  it("allows images for vision-capable models", () => {
    const cfg = normalizeApiConfig({
      aiProvider: "openrouter",
      apiKey: "sk-test",
      model: "openai/gpt-4o",
    });
    expect(modelSupportsImages(cfg)).toBe(true);
  });

  it("flags image attachments when model lacks vision", () => {
    const cfg = normalizeApiConfig({
      aiProvider: "openrouter",
      apiKey: "sk-test",
      model: "openrouter/free",
    });
    const unsupported = findUnsupportedVisionAttachments(
      [{ id: "1", kind: "image", mediaType: "image/png", name: "x.png", dataUrl: "data:image/png;base64,ab" }],
      cfg
    );
    expect(unsupported).toHaveLength(1);
    expect(attachmentRequiresVision(unsupported[0])).toBe(true);
  });
});
