import { describe, expect, it } from "vitest";
import { buildGgufModelId, isLocalGgufModelId, parseGgufRegistryId } from "./ids";

describe("localGguf ids", () => {
  it("detects gguf model id", () => {
    expect(isLocalGgufModelId("openbentt/gguf:550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isLocalGgufModelId("meta-llama/foo")).toBe(false);
  });

  it("parses registry uuid", () => {
    const id = "550e8400-e29b-41d4-a716-446655440000";
    expect(parseGgufRegistryId(`openbentt/gguf:${id}`)).toBe(id);
    expect(parseGgufRegistryId("openbentt/gguf:bad")).toBe(null);
    expect(parseGgufRegistryId("openbentt/gguf:none")).toBe(null);
  });

  it("builds model id", () => {
    const id = "550e8400-e29b-41d4-a716-446655440000";
    expect(buildGgufModelId(id)).toBe(`openbentt/gguf:${id}`);
  });
});
