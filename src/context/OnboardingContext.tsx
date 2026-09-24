import React, { createContext, useCallback, useContext, useMemo } from "react";

/**
 * Onboarding is bypassed — the app opens directly to chat.
 * OpenCode + Ollama work without any sign-in or setup flow.
 */

interface OnboardingContextValue {
  state: string;
  completed: boolean;
  send: () => void;
  complete: () => void;
  reset: () => void;
  needsOnboarding: boolean;
}

const OnboardingContext = createContext<OnboardingContextValue>({
  state: "READY",
  completed: true,
  send: () => {},
  complete: () => {},
  reset: () => {},
  needsOnboarding: false,
});

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const value = useMemo<OnboardingContextValue>(
    () => ({
      state: "READY",
      completed: true,
      send: () => {},
      complete: () => {},
      reset: () => {},
      needsOnboarding: false,
    }),
    []
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding(): OnboardingContextValue {
  return useContext(OnboardingContext);
}
