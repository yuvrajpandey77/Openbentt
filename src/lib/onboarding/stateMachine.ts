/**
 * Phase 9 — first-run onboarding state machine (pure transitions + persistence).
 *
 * States (spec §7): FIRST_LAUNCH → AUTH_REQUIRED → AUTHENTICATING →
 * AUTHENTICATED → ENVIRONMENT_CHECK → OLLAMA_CHECK → MODEL_DISCOVERY →
 * MODEL_SETUP → READY, plus RESUME_EXISTING_USER for returning users and
 * LOCAL_ONLY for users who explicitly skip account creation (honest,
 * unauthenticated local mode — never presented as signed in).
 */

export type OnboardingState =
  | "FIRST_LAUNCH"
  | "AUTH_REQUIRED"
  | "AUTHENTICATING"
  | "AUTHENTICATED"
  | "ENVIRONMENT_CHECK"
  | "OLLAMA_CHECK"
  | "MODEL_DISCOVERY"
  | "MODEL_SETUP"
  | "READY"
  | "RESUME_EXISTING_USER"
  | "LOCAL_ONLY";

export type OnboardingEvent =
  | "START"
  | "AUTH_STARTED"
  | "AUTH_SUCCEEDED"
  | "AUTH_FAILED"
  | "AUTH_SKIPPED_LOCAL"
  | "ENV_DONE"
  | "OLLAMA_FOUND"
  | "OLLAMA_MISSING"
  | "MODEL_FOUND"
  | "MODEL_NEEDED"
  | "MODEL_READY"
  | "ONBOARDING_DONE"
  | "RESET";

const TRANSITIONS: Record<OnboardingState, Partial<Record<OnboardingEvent, OnboardingState>>> = {
  FIRST_LAUNCH: { START: "AUTH_REQUIRED", RESET: "FIRST_LAUNCH" },
  AUTH_REQUIRED: {
    AUTH_STARTED: "AUTHENTICATING",
    AUTH_SKIPPED_LOCAL: "LOCAL_ONLY",
    RESET: "FIRST_LAUNCH",
  },
  AUTHENTICATING: {
    AUTH_SUCCEEDED: "AUTHENTICATED",
    AUTH_FAILED: "AUTH_REQUIRED",
    RESET: "FIRST_LAUNCH",
  },
  AUTHENTICATED: { ENV_DONE: "ENVIRONMENT_CHECK", RESET: "FIRST_LAUNCH" },
  ENVIRONMENT_CHECK: {
    OLLAMA_FOUND: "MODEL_DISCOVERY",
    OLLAMA_MISSING: "OLLAMA_CHECK",
    RESET: "FIRST_LAUNCH",
  },
  OLLAMA_CHECK: {
    OLLAMA_FOUND: "MODEL_DISCOVERY",
    OLLAMA_MISSING: "MODEL_SETUP",
    RESET: "FIRST_LAUNCH",
  },
  MODEL_DISCOVERY: {
    MODEL_FOUND: "READY",
    MODEL_NEEDED: "MODEL_SETUP",
    RESET: "FIRST_LAUNCH",
  },
  MODEL_SETUP: { MODEL_READY: "READY", RESET: "FIRST_LAUNCH" },
  READY: { ONBOARDING_DONE: "READY", RESET: "FIRST_LAUNCH" },
  RESUME_EXISTING_USER: { ONBOARDING_DONE: "READY", RESET: "FIRST_LAUNCH" },
  LOCAL_ONLY: { ENV_DONE: "ENVIRONMENT_CHECK", RESET: "FIRST_LAUNCH" },
};

export function onboardingTransition(state: OnboardingState, event: OnboardingEvent): OnboardingState {
  return TRANSITIONS[state][event] ?? state;
}

/** States from which a restart must resume (never restart a finished flow). */
export function isOnboardingIncomplete(state: OnboardingState): boolean {
  return state !== "READY";
}

export interface PersistedOnboarding {
  state: OnboardingState;
  completed: boolean;
  updatedAt: string;
}

export const ONBOARDING_STORAGE_KEY = "openbentt-onboarding-v1";

export function serializeOnboarding(state: OnboardingState, completed: boolean): PersistedOnboarding {
  return { state, completed, updatedAt: new Date().toISOString() };
}

export function parsePersistedOnboarding(raw: string | null): PersistedOnboarding | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw) as Partial<PersistedOnboarding>;
    if (typeof obj.state !== "string" || !(obj.state in TRANSITIONS)) return null;
    return {
      state: obj.state as OnboardingState,
      completed: obj.completed === true,
      updatedAt: typeof obj.updatedAt === "string" ? obj.updatedAt : new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}

/** Resolve the startup state: completed → resume; interrupted → resume mid-flow. */
export function resolveStartupState(persisted: PersistedOnboarding | null): OnboardingState {
  if (!persisted) return "FIRST_LAUNCH";
  if (persisted.completed) return "RESUME_EXISTING_USER";
  return persisted.state;
}
