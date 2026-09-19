import React, { createContext, useContext, useMemo } from "react";
import {
  ClerkProvider,
  useAuth as useClerkAuth,
  useUser as useClerkUser,
  useClerk as useClerkInstance,
} from "@clerk/clerk-react";

/**
 * Phase 9 — real Clerk authentication (publishable key only in renderer;
 * no secret keys, no custom passwords, no local boolean login).
 *
 * When `VITE_CLERK_PUBLISHABLE_KEY` is absent (e.g. dev without Clerk
 * setup), status is `unconfigured` and the app runs in honest local-only
 * mode — the UI must NEVER present this as signed in.
 */

const PUBLISHABLE_KEY = (import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined)?.trim() || "";

export function isClerkConfigured(): boolean {
  return PUBLISHABLE_KEY.length > 0;
}

export type AuthStatus = "unconfigured" | "loading" | "signed-out" | "signed-in";

export interface AuthUser {
  id: string;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
}

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  status: "unconfigured",
  user: null,
  signOut: async () => {},
});

function ClerkStateBridge({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn, userId } = useClerkAuth();
  const { user } = useClerkUser();
  const clerk = useClerkInstance();

  const value = useMemo<AuthContextValue>(() => {
    if (!isLoaded) return { status: "loading", user: null, signOut: async () => {} };
    if (!isSignedIn || !user) {
      return { status: "signed-out", user: null, signOut: async () => {} };
    }
    return {
      status: "signed-in",
      user: {
        id: userId ?? user.id,
        displayName:
          user.fullName || user.username || user.primaryEmailAddress?.emailAddress || "Account",
        email: user.primaryEmailAddress?.emailAddress ?? null,
        avatarUrl: user.imageUrl ?? null,
      },
      signOut: async () => {
        await clerk.signOut();
      },
    };
  }, [isLoaded, isSignedIn, userId, user, clerk]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Root auth provider — mount once around the whole app. */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  if (!isClerkConfigured()) {
    return (
      <AuthContext.Provider
        value={{ status: "unconfigured", user: null, signOut: async () => {} }}
      >
        {children}
      </AuthContext.Provider>
    );
  }
  return (
    <ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/">
      <ClerkStateBridge>{children}</ClerkStateBridge>
    </ClerkProvider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
