import { describe, it, expect, afterEach } from "vitest";
import {
  apiConfigForBrowserStorage,
  apiConfigForMemoryOnlyStorage,
} from "./desktopSecrets";
import { defaultApiConfig } from "@/types/chat";

afterEach(() => {
  // @ts-expect-error test cleanup: remove stubbed window
  delete (globalThis as Record<string, unknown>).window;
});

describe("apiConfigForMemoryOnlyStorage (web path)", () => {
  it("blanks provider secrets before persistence", () => {
    const cfg = {
      ...defaultApiConfig(),
      apiKey: "sk-test",
      braveSearchApiKey: "brave-test",
      huggingFaceToken: "hf_test",
    };
    const out = apiConfigForMemoryOnlyStorage(cfg);
    expect(out.apiKey).toBe("");
    expect(out.braveSearchApiKey).toBe("");
    expect(out.huggingFaceToken).toBe("");
    // Non-secret settings survive.
    expect(out.model).toBe(cfg.model);
    expect(out.aiProvider).toBe(cfg.aiProvider);
    // Caller config is untouched.
    expect(cfg.apiKey).toBe("sk-test");
  });
});

describe("desktop path", () => {
  it("memory-only helper is a no-op on desktop (vault owns secrets)", () => {
    (globalThis as Record<string, unknown>).window = { openbenttDesktop: { isElectron: true } };
    const cfg = { ...defaultApiConfig(), apiKey: "sk-test" };
    expect(apiConfigForMemoryOnlyStorage(cfg).apiKey).toBe("sk-test");
    expect(apiConfigForBrowserStorage(cfg).apiKey).toBe("");
  });
});
