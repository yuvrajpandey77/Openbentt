import { describe, it, expect } from "vitest";
import {
  assertChatProviderAllowed,
  OfflineBlockedError,
  connectivityState,
  isResearchNetworkAllowed,
} from "@/lib/offline/mode";
import { defaultApiConfig } from "@/types/chat";
import type { PrivacyPreferences } from "@/lib/privacy/privacyPreferences";

const localOnlyPrefs: PrivacyPreferences = {
  localOnlyMode: true,
  cloudInferenceOptIn: false,
  analyticsEnabled: false,
  allowShareLinks: false,
  showNetworkActivityWarnings: true,
};

describe("offline / local-only mode", () => {
  it("blocks cloud chat when local-only", () => {
    const cfg = defaultApiConfig();
    cfg.aiProvider = "openrouter";
    cfg.apiKey = "sk-test";
    expect(() => assertChatProviderAllowed(cfg, false, localOnlyPrefs)).toThrow(OfflineBlockedError);
  });

  it("allows webgpu when local-only", () => {
    const cfg = defaultApiConfig();
    cfg.aiProvider = "webgpu_gemma";
    expect(() => assertChatProviderAllowed(cfg, false, localOnlyPrefs)).not.toThrow();
  });

  it("blocks research network in local-only", () => {
    expect(isResearchNetworkAllowed(undefined, false, localOnlyPrefs)).toBe(false);
  });

  it("connectivity state reflects local-only", () => {
    expect(connectivityState(false, localOnlyPrefs)).toBe("offline_first");
    expect(connectivityState(true, { ...localOnlyPrefs, localOnlyMode: false })).toBe("offline");
  });
});
