import { describe, it, expect } from "vitest";
import {
  defaultOpenCodeModel,
  isFreeOpenCodeModel,
  sortOpenCodeModels,
} from "@/lib/agent/openCodeChat";

const models = [
  { id: "pro-model", displayName: "Pro Model", available: true },
  { id: "flash-free", displayName: "Flash", available: true },
  { id: "org/other:free", displayName: "Other Free", available: true },
  { id: "zen-model", displayName: "Zen", available: true },
];

describe("universal OpenCode model selection", () => {
  it("detects free-tier models", () => {
    expect(isFreeOpenCodeModel({ id: "org/other:free" })).toBe(true);
    expect(isFreeOpenCodeModel({ id: "zen-model" })).toBe(true);
    expect(isFreeOpenCodeModel({ id: "pro-model" })).toBe(false);
  });

  it("sorts free models first", () => {
    const sorted = sortOpenCodeModels(models);
    expect(sorted.slice(0, 3).every(isFreeOpenCodeModel)).toBe(true);
    expect(sorted[sorted.length - 1].id).toBe("pro-model");
  });

  it("defaults to the first free model", () => {
    expect(defaultOpenCodeModel(models)).toBe("flash-free");
  });

  it("falls back to auto with no models", () => {
    expect(defaultOpenCodeModel([])).toBe("auto");
  });
});
