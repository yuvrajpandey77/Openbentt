import React, { useState } from "react";
import { SignIn, SignUp } from "@clerk/clerk-react";
import { Loader2 } from "lucide-react";
import { isClerkConfigured, useAuth } from "@/context/AuthContext";
import { useOnboarding } from "@/context/OnboardingContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Phase 9 — Openbentt-native auth screen backed by real Clerk components.
 * Quiet dark UI, inline states; no raw provider errors leak to users.
 */
export const AuthPage: React.FC = () => {
  const { status } = useAuth();
  const { send } = useOnboarding();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const configured = isClerkConfigured();

  React.useEffect(() => {
    if (status === "signed-in") send("AUTH_SUCCEEDED");
  }, [status, send]);

  const begin = () => send("AUTH_STARTED");

  if (!configured) {
    return (
      <AuthShell title="Sign in" subtitle="Authentication is not configured in this build.">
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 text-sm">
          <p className="text-muted-foreground">
            The desktop app needs a Clerk publishable key to enable sign in. Set{" "}
            <code className="rounded bg-muted px-1 text-xs">VITE_CLERK_PUBLISHABLE_KEY</code> and
            rebuild. You can continue using Openbentt locally without an account.
          </p>
          <LocalOnlyButton />
        </div>
      </AuthShell>
    );
  }

  if (status === "loading") {
    return (
      <AuthShell title="Sign in" subtitle="Checking your session…">
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 size={16} className="animate-spin" /> Restoring session…
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={mode === "signin" ? "Welcome back" : "Create your account"}
      subtitle={
        mode === "signin"
          ? "Sign in to sync your workspace across sessions."
          : "One account for your Openbentt workspace."
      }
    >
      <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1" role="tablist" aria-label="Sign in or create account">
        {(["signin", "signup"] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition-colors",
              mode === m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {m === "signin" ? "Sign in" : "Sign up"}
          </button>
        ))}
      </div>
      <div onClickCapture={begin}>
        {mode === "signin" ? (
          <ClerkAuthCard>
            <SignIn routing="hash" signUpUrl="#" afterSignInUrl="#" />
          </ClerkAuthCard>
        ) : (
          <ClerkAuthCard>
            <SignUp routing="hash" signInUrl="#" afterSignUpUrl="#" />
          </ClerkAuthCard>
        )}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-[11px] text-muted-foreground">or</span>
        <div className="h-px flex-1 bg-border" />
      </div>
      <div className="mt-4">
        <LocalOnlyButton />
      </div>
    </AuthShell>
  );
};

function LocalOnlyButton() {
  const { send, complete } = useOnboarding();
  return (
    <Button
      variant="ghost"
      className="w-full text-sm text-muted-foreground hover:text-foreground"
      onClick={() => {
        // Explicit, honest local mode — never presented as authenticated.
        send("AUTH_SKIPPED_LOCAL");
        send("ENV_DONE");
        complete();
      }}
    >
      Continue without an account (local only)
    </Button>
  );
}

function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <img src="/openbentt-logo.svg" alt="Openbentt" className="h-11 w-11 object-contain" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Constrain Clerk's element tree to the Openbentt dark aesthetic. */
function ClerkAuthCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="clerk-openbentt overflow-hidden rounded-xl border border-border bg-card">
      {children}
    </div>
  );
}
