import { describe, it, expect } from "vitest";
import { routeModelForTask, ModelRouteError } from "@/lib/modelRouting/router";
import { buildAvailabilityContext } from "@/lib/modelManager/availability";
import { webgpuDescriptors, embeddingDescriptor } from "@/lib/modelManager/catalog";
import { defaultApiConfig } from "@/types/chat";
import { LOCAL_TINY_MODEL_ID } from "@/lib/gemmaWebGpu/models";

describe("task routing", () => {
  const candidates = [...webgpuDescriptors(), embeddingDescriptor()];

  it("routes lightweight tasks to smallest ready model", () => {
    const cfg = defaultApiConfig();
    cfg.aiProvider = "webgpu_gemma";
    cfg.model = LOCAL_TINY_MODEL_ID;
    const ctx = buildAvailabilityContext(cfg);
    const route = routeModelForTask("chat_lightweight", cfg, candidates, ctx);
    expect(route.backend).toBe("webgpu");
    expect(route.task).toBe("chat_lightweight");
    expect(route.displayLabel).not.toContain("Meridian");
  });

  it("routes embedding to MiniLM not chat model", () => {
    const cfg = defaultApiConfig();
    const ctx = buildAvailabilityContext(cfg);
    const route = routeModelForTask("embedding", cfg, candidates, ctx);
    expect(route.modelId).toContain("minilm");
    expect(route.reason).toMatch(/embedding/i);
  });

  it("throws when local-only and cloud configured for general chat", () => {
    const cfg = defaultApiConfig();
    cfg.aiProvider = "openrouter";
    cfg.apiKey = "sk-test";
    const ctx = buildAvailabilityContext(cfg, { localOnlyMode: true });
    expect(() => routeModelForTask("chat_general", cfg, candidates, ctx)).toThrow(ModelRouteError);
  });

  it("throws missing_model for synthesis when local-only and no large models", () => {
    const cfg = defaultApiConfig();
    cfg.aiProvider = "webgpu_gemma";
    const ctx = buildAvailabilityContext(cfg, { localOnlyMode: true });
    expect(() => routeModelForTask("chat_synthesis", cfg, [embeddingDescriptor()], ctx)).toThrow(
      ModelRouteError
    );
  });
});
