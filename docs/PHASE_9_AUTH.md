# PHASE 9 AUTH — Clerk Integration

## 1. Architecture Decision

**Provider**: Clerk (React SDK `@clerk/clerk-react`)

**Rationale**:
- Publishable-key-only in renderer (no secret keys exposed)
- Electron-safe: browser-based OAuth with PKCE/state validation
- Handles: signup, login, logout, session restore, email verification, password reset, social providers
- Session lifecycle managed by Clerk; app receives `isLoaded` + `isSignedIn`

## 2. Renderer Integration (`src/context/AuthContext.tsx`)

```typescript
const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.trim() || "";

function ClerkStateBridge({ children }) {
  const { isLoaded, isSignedIn, userId } = useClerkAuth();
  const { user } = useClerkUser();
  const clerk = useClerkInstance();

  const value = useMemo(() => {
    if (!isLoaded) return { status: "loading", user: null, signOut: async () => {} };
    if (!isSignedIn || !user) return { status: "signed-out", user: null, signOut: async () => {} };
    return {
      status: "signed-in",
      user: { id: userId ?? user.id, displayName: ..., email: ..., avatarUrl: ... },
      signOut: async () => { await clerk.signOut(); },
    };
  }, [isLoaded, isSignedIn, userId, user, clerk]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AuthProvider({ children }) {
  if (!isClerkConfigured()) {
    return <AuthContext.Provider value={{ status: "unconfigured", ... }}>{children}</AuthContext.Provider>;
  }
  return (
    <ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/">
      <ClerkStateBridge>{children}</ClerkStateBridge>
    </ClerkProvider>
  );
}
```

**States exposed to app**:
- `unconfigured` — `VITE_CLERK_PUBLISHABLE_KEY` not set; honest local-only mode
- `loading` — Clerk SDK initializing
- `signed-out` — No active session
- `signed-in` — Real Clerk session, `user` populated

## 3. Auth UI (`src/components/AuthPage.tsx`)

- **Sign In tab**: `<SignIn routing="hash" />`
- **Sign Up tab**: `<SignUp routing="hash" />`
- **Continue without account**: `AUTH_SKIPPED_LOCAL` → honest local-only (never presented as signed in)
- **Visual**: Dark, minimal, Openbentt-branded; Clerk components styled via `.clerk-openbentt` wrapper
- **Error handling**: Clerk's built-in UI; no raw provider errors leaked

## 4. Account Menu (`src/components/AccountMenu.tsx`)

- Shows avatar (Clerk `imageUrl` or initials)
- Display name / email / "Local only"
- "Account & settings" → `/settings`
- "Sign out" → `clerk.signOut()` → Clerk clears session → app state updates

## 5. Onboarding Integration (`src/components/OnboardingFlow.tsx`)

```
AUTH_REQUIRED → AuthPage
     ↓ user signs in (Clerk fires isSignedIn=true)
AUTHENTICATING → effect sends AUTH_SUCCEEDED
AUTHENTICATED → effect sends ENV_DONE
```

- `AuthPage` on sign-in: `send("AUTH_SUCCEEDED")` via `useOnboarding()`
- `AuthStep` watches state, auto-advances on `AUTHENTICATED`

## 6. Electron-Specific Notes

- **No custom protocol handler needed** — Clerk uses standard browser OAuth redirect
- **`afterSignOutUrl="/"`** — returns to marketing (web) or onboarding (desktop)
- **Desktop build**: Set `VITE_CLERK_PUBLISHABLE_KEY` at build time (CI)
- **Dev without Clerk**: App runs in `unconfigured` state → local-only mode

## 7. Security

| Threat | Mitigation |
|--------|------------|
| Secret key in bundle | Only `VITE_CLERK_PUBLISHABLE_KEY` (public by design) |
| Session hijacking | Clerk handles secure cookies + token rotation |
| Phishing | Official Clerk hosted pages; `afterSignOutUrl` prevent open redirect |
| Local-first bypass | `unconfigured` state → app NEVER pretends to be signed in |

## 8. Configuration

```bash
# .env (build-time only)
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
```

Get from Clerk Dashboard → API Keys → Publishable Key.

## 9. Testing

- **Unit**: `AuthContext` logic (unconfigured/loading/signed-in/out)
- **Integration**: Clerk SDK initialization, sign-in/out flow
- **E2E**: Sign up → email verify → sign in → restart → session restored
- **Live**: Requires `VITE_CLERK_PUBLISHABLE_KEY`; marked BLOCKED without