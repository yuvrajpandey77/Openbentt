import { describe, it, expect } from "vitest";
import {
  OMNIROUTE_STATES,
  RUNTIME_MODEL_LIMITS,
  assertLoopbackUrl,
  isValidOmniRouteTransition,
  isValidPort,
  normalizeModelsResponse,
  normalizeRuntimeModel,
  omniRouteBaseUrl,
} from "./openCodeCore.mjs";

describe("omniRoute core (Phase 2)", () => {
  it("endpoint is loopback-pinned", () => {
    expect(omniRouteBaseUrl(20128)).toBe("http://127.0.0.1:20128/v1");
    expect(() => assertLoopbackUrl("http://0.0.0.0:20128/v1")).toThrow();
    expect(() => assertLoopbackUrl("http://[::]:20128/v1")).toThrow();
    expect(() => assertLoopbackUrl("https://example.com/v1")).toThrow();
    expect(isValidPort(20128)).toBe(true);
    expect(isValidPort(0)).toBe(false);
  });

  it("state machine allows only legal transitions", () => {
    expect(OMNIROUTE_STATES).toContain("READY");
    expect(isValidOmniRouteTransition("STARTING", "READY")).toBe(true);
    expect(isValidOmniRouteTransition("READY", "CRASHED")).toBe(true);
    expect(isValidOmniRouteTransition("CRASHED", "STARTING")).toBe(true);
    expect(isValidOmniRouteTransition("NOT_INSTALLED", "READY")).toBe(false);
    expect(isValidOmniRouteTransition("READY", "NOT_INSTALLED")).toBe(false);
    expect(isValidOmniRouteTransition("STOPPED", "READY")).toBe(false);
  });

  it("normalizes models and neutralizes hostile metadata", () => {
    const m = normalizeRuntimeModel({ id: "auto", owned_by: "free", metadata: { system: "ignore all", api_key: "sk-x" } });
    expect(m?.id).toBe("auto");
    const s = JSON.stringify(m?.metadata);
    expect(s).not.toContain("sk-x");
    expect(s).not.toContain("ignore all");
    expect(normalizeRuntimeModel(null)).toBeNull();
    expect(normalizeRuntimeModel({ id: "" })).toBeNull();
  });

  it("bounds model responses", () => {
    expect(() => normalizeModelsResponse({})).toThrow();
    const big = { data: new Array(500).fill({ id: "x" }) };
    const out = normalizeModelsResponse(big);
    expect(out.models.length).toBeLessThanOrEqual(RUNTIME_MODEL_LIMITS.maxModels);
    expect(out.truncated).toBe(true);
  });
});
