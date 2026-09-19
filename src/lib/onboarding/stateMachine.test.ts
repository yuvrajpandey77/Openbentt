import { describe, it, expect } from "vitest";
import {
  onboardingTransition,
  resolveStartupState,
  parsePersistedOnboarding,
  isOnboardingIncomplete,
} from "./stateMachine";

describe("onboarding state machine", () => {
  it("walks the happy path to READY", () => {
    let s = onboardingTransition("FIRST_LAUNCH", "START");
    s = onboardingTransition(s, "AUTH_STARTED");
    s = onboardingTransition(s, "AUTH_SUCCEEDED");
    s = onboardingTransition(s, "ENV_DONE");
    s = onboardingTransition(s, "OLLAMA_FOUND");
    s = onboardingTransition(s, "MODEL_FOUND");
    expect(s).toBe("READY");
    expect(isOnboardingIncomplete(s)).toBe(false);
  });

  it("routes missing Ollama through setup", () => {
    let s = onboardingTransition("ENVIRONMENT_CHECK", "OLLAMA_MISSING");
    expect(s).toBe("OLLAMA_CHECK");
    s = onboardingTransition(s, "OLLAMA_MISSING");
    expect(s).toBe("MODEL_SETUP");
    expect(onboardingTransition(s, "MODEL_READY")).toBe("READY");
  });

  it("supports honest local-only skip", () => {
    expect(onboardingTransition("AUTH_REQUIRED", "AUTH_SKIPPED_LOCAL")).toBe("LOCAL_ONLY");
  });

  it("ignores unknown events (no stuck transitions)", () => {
    expect(onboardingTransition("MODEL_SETUP", "AUTH_SUCCEEDED")).toBe("MODEL_SETUP");
  });

  it("resumes interrupted onboarding and completed users correctly", () => {
    expect(resolveStartupState(null)).toBe("FIRST_LAUNCH");
    expect(resolveStartupState({ state: "MODEL_SETUP", completed: false, updatedAt: "" })).toBe("MODEL_SETUP");
    expect(resolveStartupState({ state: "READY", completed: true, updatedAt: "" })).toBe(
      "RESUME_EXISTING_USER"
    );
  });

  it("rejects corrupt persisted payloads", () => {
    expect(parsePersistedOnboarding(null)).toBeNull();
    expect(parsePersistedOnboarding("not json")).toBeNull();
    expect(parsePersistedOnboarding('{"state":"BOGUS"}')).toBeNull();
  });
});
