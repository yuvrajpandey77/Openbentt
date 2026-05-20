import { describe, it, expect } from "vitest";
import {
  buildAvailabilityContext,
  checkConfiguredModelAvailability,
  checkModelAvailability,
} from "@/lib/modelManager/availability";
import { webgpuDescriptors, embeddingDescriptor } from "@/lib/modelManager/catalog";
import { defaultApiConfig } from "@/types/chat";
import { LOCAL_TINY_MODEL_ID } from "@/lib/gemmaWebGpu/models";
import { GGUF_MODEL_NONE } from "@/lib/localGguf/ids";

describe("model availability", () => {
  it("blocks cloud provider in local-only mode", () => {
    const cfg = defaultApiConfig();
    cfg.aiProvider = "openrouter";
    cfg.apiKey = "sk-test";
    cfg.model = "meta-llama/llama-3.3-70b-instruct:free";

    const ctx = buildAvailabilityContext(cfg, { localOnlyMode: true });
    const result = checkConfiguredModelAvailability(cfg, ctx);
    expect(result.state).toBe("blocked_offline");
  });

  it("reports missing GGUF when none selected", () => {
    const cfg = defaultApiConfig();
    cfg.aiProvider = "local_gguf";
    cfg.model = GGUF_MODEL_NONE;

    const ctx = buildAvailabilityContext(cfg, { llamaBinaryReady: true });
    const result = checkConfiguredModelAvailability(cfg, ctx);
    expect(result.state).toBe("missing");
  });

  it("reports downloadable for webgpu models", () => {
    const tiny = webgpuDescriptors().find((m) => m.id === LOCAL_TINY_MODEL_ID)!;
    const ctx = buildAvailabilityContext(defaultApiConfig());
    const avail = checkModelAvailability(tiny, ctx);
    expect(avail.state).toBe("downloadable");
  });

  it("embedding model is always ready/downloadable not a chat LLM", () => {
    const embed = embeddingDescriptor();
    expect(embed.capabilities).toEqual(["embedding"]);
    const ctx = buildAvailabilityContext(defaultApiConfig());
    expect(checkModelAvailability(embed, ctx).state).toBe("ready");
  });
});
