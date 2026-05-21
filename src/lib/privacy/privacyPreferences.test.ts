import { describe, it, expect } from "vitest";
import {
  defaultPrivacyPreferences,
  isCloudInferenceAllowed,
  isNetworkResearchAllowed,
  isShareLinkAllowed,
  isAnalyticsAllowed,
} from "./privacyPreferences";

describe("privacyPreferences", () => {
  it("blocks cloud providers in local-only mode", () => {
    const prefs = { ...defaultPrivacyPreferences(), localOnlyMode: true, cloudInferenceOptIn: true };
    expect(isCloudInferenceAllowed("openrouter", "", prefs)).toBe(false);
    expect(isCloudInferenceAllowed("webgpu_gemma", "", prefs)).toBe(true);
  });

  it("allows loopback openai_compatible in local-only", () => {
    const prefs = { ...defaultPrivacyPreferences(), localOnlyMode: true };
    expect(isCloudInferenceAllowed("openai_compatible", "http://127.0.0.1:11434/v1", prefs)).toBe(true);
  });

  it("requires cloud opt-in for remote APIs", () => {
    const prefs = { ...defaultPrivacyPreferences(), localOnlyMode: false, cloudInferenceOptIn: false };
    expect(isCloudInferenceAllowed("openrouter", "", prefs)).toBe(false);
    const opted = { ...prefs, cloudInferenceOptIn: true };
    expect(isCloudInferenceAllowed("openrouter", "", opted)).toBe(true);
  });

  it("disables network research and share in local-only", () => {
    const prefs = { ...defaultPrivacyPreferences(), localOnlyMode: true };
    expect(isNetworkResearchAllowed(prefs)).toBe(false);
    expect(isShareLinkAllowed(prefs)).toBe(false);
  });

  it("grantCloudInferenceAccess allows openrouter after desktop defaults", () => {
    const blocked = { ...defaultPrivacyPreferences(), localOnlyMode: true, cloudInferenceOptIn: false };
    expect(isCloudInferenceAllowed("openrouter", "", blocked)).toBe(false);
    const granted = { ...blocked, localOnlyMode: false, cloudInferenceOptIn: true };
    expect(isCloudInferenceAllowed("openrouter", "", granted)).toBe(true);
  });
});
