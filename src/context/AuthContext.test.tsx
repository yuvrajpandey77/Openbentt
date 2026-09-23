import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * Authentication regression suite (final production pass).
 *
 * The auth subsystem is Clerk-backed and optional: without a publishable key
 * the app runs in honest local-only mode and must NEVER present itself as
 * signed in. These tests pin: unconfigured local mode, loading/session
 * restore, signed-out, signed-in, sign-out, and that voice/agent surfaces
 * never depend on auth state.
 */

const clerkState = {
  isLoaded: true,
  isSignedIn: false as boolean,
  userId: null as string | null,
  user: null as unknown,
  signOut: vi.fn(async () => {}),
};

vi.mock("@clerk/clerk-react", () => ({
  ClerkProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => ({ isLoaded: clerkState.isLoaded, isSignedIn: clerkState.isSignedIn, userId: clerkState.userId }),
  useUser: () => ({ user: clerkState.user }),
  useClerk: () => ({ signOut: clerkState.signOut }),
  SignIn: () => <div data-testid="clerk-signin">clerk-signin</div>,
  SignUp: () => <div data-testid="clerk-signup">clerk-signup</div>,
}));

vi.mock("@/context/OnboardingContext", () => ({
  OnboardingProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useOnboarding: () => ({ needsOnboarding: false, send: vi.fn() }),
}));

async function loadAuth() {
  vi.resetModules();
  return import("@/context/AuthContext");
}

function signedInUser() {
  return {
    id: "user_123",
    fullName: "Ada Tester",
    username: null,
    primaryEmailAddress: { emailAddress: "ada@example.com" },
    imageUrl: "https://example.com/a.png",
  };
}

describe("AuthContext (unconfigured local mode)", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "");
    clerkState.isLoaded = true;
    clerkState.isSignedIn = false;
    clerkState.userId = null;
    clerkState.user = null;
    clerkState.signOut.mockClear();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reports unconfigured and never signed-in without a key", async () => {
    const { AuthProvider, useAuth, isClerkConfigured } = await loadAuth();
    expect(isClerkConfigured()).toBe(false);
    let seen: string | null = null;
    let userSeen: unknown = "unset";
    function Probe() {
      const { status, user } = useAuth();
      seen = status;
      userSeen = user;
      return null;
    }
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    expect(seen).toBe("unconfigured");
    expect(userSeen).toBeNull();
  });

  it("signOut resolves harmlessly when unconfigured", async () => {
    const { AuthProvider, useAuth } = await loadAuth();
    let signOut!: () => Promise<void>;
    function Probe() {
      signOut = useAuth().signOut;
      return null;
    }
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    await expect(signOut()).resolves.toBeUndefined();
  });

  it("AuthPage explains local-only mode and never renders the app shell", async () => {
    await loadAuth();
    const { AuthPage } = await import("@/components/AuthPage");
    const { container } = render(
      <MemoryRouter>
        <AuthPage />
      </MemoryRouter>
    );
    expect(screen.getByText(/not configured in this build/i)).toBeTruthy();
    expect(screen.getByText(/continue without an account/i)).toBeTruthy();
    expect(screen.queryByTestId("clerk-signin")).toBeNull();
    expect(container.querySelector('[aria-label="Primary"]')).toBeNull();
  });
});

describe("AuthContext (configured Clerk states)", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "pk_test_regression");
    clerkState.isLoaded = true;
    clerkState.isSignedIn = false;
    clerkState.userId = null;
    clerkState.user = null;
    clerkState.signOut.mockClear();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("restores sessions: loading → signed-out → signed-in", async () => {
    const { AuthProvider, useAuth } = await loadAuth();
    const seen: string[] = [];
    function Probe() {
      seen.push(useAuth().status);
      return null;
    }
    // loading
    clerkState.isLoaded = false;
    const { rerender } = render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    expect(seen.at(-1)).toBe("loading");
    // signed-out
    clerkState.isLoaded = true;
    rerender(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    expect(seen.at(-1)).toBe("signed-out");
    // signed-in with mapped profile
    clerkState.isSignedIn = true;
    clerkState.userId = "user_123";
    clerkState.user = signedInUser();
    rerender(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    expect(seen.at(-1)).toBe("signed-in");
    expect(seen).toContain("loading");
  });

  it("maps the user profile and signs out through Clerk", async () => {
    clerkState.isSignedIn = true;
    clerkState.userId = "user_123";
    clerkState.user = signedInUser();
    const { AuthProvider, useAuth } = await loadAuth();
    let signOut!: () => Promise<void>;
    let email: unknown = null;
    function Probe() {
      const { user, signOut: so } = useAuth();
      email = user?.email;
      signOut = so;
      return null;
    }
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    expect(email).toBe("ada@example.com");
    await signOut();
    expect(clerkState.signOut).toHaveBeenCalledTimes(1);
  });

  it("AuthPage shows sign-in UI when configured and signed out", async () => {
    await loadAuth();
    const { AuthPage } = await import("@/components/AuthPage");
    render(
      <MemoryRouter>
        <AuthPage />
      </MemoryRouter>
    );
    expect(screen.getByTestId("clerk-signin")).toBeTruthy();
    expect(screen.queryByText(/not configured in this build/i)).toBeNull();
  });

  it("AuthPage loading state never flashes the app shell", async () => {
    clerkState.isLoaded = false;
    const { AuthProvider } = await loadAuth();
    const { AuthPage } = await import("@/components/AuthPage");
    const { container } = render(
      <MemoryRouter>
        <AuthProvider>
          <AuthPage />
        </AuthProvider>
      </MemoryRouter>
    );
    expect(screen.getByText(/restoring session/i)).toBeTruthy();
    expect(container.querySelector('[aria-label="Primary"]')).toBeNull();
  });

  it("logout returns to signed-out without crashing listeners", async () => {
    clerkState.isSignedIn = true;
    clerkState.userId = "user_123";
    clerkState.user = signedInUser();
    const { AuthProvider, useAuth } = await loadAuth();
    const seen: string[] = [];
    let signOut!: () => Promise<void>;
    function Probe() {
      const { status, signOut: so } = useAuth();
      seen.push(status);
      signOut = so;
      return null;
    }
    const { rerender } = render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    expect(seen.at(-1)).toBe("signed-in");
    await signOut();
    clerkState.isSignedIn = false;
    clerkState.userId = null;
    clerkState.user = null;
    rerender(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    expect(seen.at(-1)).toBe("signed-out");
  });
});

describe("agent/voice surfaces do not depend on auth", () => {
  it("openCodeAgentApi and harness import without auth providers", async () => {
    const api = await import("@/lib/agent/openCodeAgentApi");
    const harness = await import("@/lib/agent/openCodeHarness");
    expect(typeof api.hasOpenCodeDesktopApi).toBe("function");
    expect(typeof harness.decideRoute).toBe("function");
    const src = [
      await import("node:fs").then((fs) => fs.readFileSync("src/lib/agent/openCodeAgentApi.ts", "utf8")),
      await import("node:fs").then((fs) => fs.readFileSync("electron/voiceService.mjs", "utf8")),
    ].join("\n");
    expect(src).not.toMatch(/useAuth|AuthContext|Clerk/);
  });
});
