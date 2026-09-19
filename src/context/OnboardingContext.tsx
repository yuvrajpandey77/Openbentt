import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  ONBOARDING_STORAGE_KEY,
  parsePersistedOnboarding,
  resolveStartupState,
  serializeOnboarding,
  onboardingTransition,
  type OnboardingEvent,
  type OnboardingState,
} from "@/lib/onboarding/stateMachine";

/**
 * Phase 9 — first-run onboarding driver. Persists non-sensitive flow state
 * to localStorage so restarts/crashes resume mid-flow instead of restarting.
 */

interface OnboardingContextValue {
  state: OnboardingState;
  completed: boolean;
  send: (event: OnboardingEvent) => void;
  complete: () => void;
  reset: () => void;
  /** True while the onboarding flow should be shown instead of the app. */
  needsOnboarding: boolean;
}

const OnboardingContext = createContext<OnboardingContextValue>({
  state: "FIRST_LAUNCH",
  completed: false,
  send: () => {},
  complete: () => {},
  reset: () => {},
  needsOnboarding: true,
});

function loadInitial(): { state: OnboardingState; completed: boolean } {
  try {
    const raw = localStorage.getItem(ONBOARDING_STORAGE_KEY);
    const persisted = parsePersistedOnboarding(raw);
    const state = resolveStartupState(persisted);
    return { state, completed: persisted?.completed === true };
  } catch {
    return { state: "FIRST_LAUNCH", completed: false };
  }
}

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [initial] = useState(loadInitial);
  const [state, setState] = useState<OnboardingState>(initial.state);
  const [completed, setCompleted] = useState<boolean>(initial.completed);

  useEffect(() => {
    try {
      localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(serializeOnboarding(state, completed)));
    } catch {
      /* private mode / quota — flow still works in memory */
    }
  }, [state, completed]);

  const send = useCallback((event: OnboardingEvent) => {
    setState((prev) => onboardingTransition(prev, event));
  }, []);

  const complete = useCallback(() => {
    setCompleted(true);
    setState("READY");
  }, []);

  const reset = useCallback(() => {
    setCompleted(false);
    setState("FIRST_LAUNCH");
  }, []);

  const value = useMemo<OnboardingContextValue>(
    () => ({
      state,
      completed,
      send,
      complete,
      reset,
      needsOnboarding: !completed,
    }),
    [state, completed, send, complete, reset]
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useOnboarding(): OnboardingContextValue {
  return useContext(OnboardingContext);
}
