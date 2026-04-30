import React from "react";

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Top-level error boundary. Keeps a render-time exception from blanking the whole page and gives
 * the user an actionable fallback (reload / clear localStorage). Logs to console for Sentry/etc.
 */
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error("[Openbentt] uncaught render error", error, info);
  }

  private reload = () => {
    this.setState({ error: null });
    window.location.reload();
  };

  private clearAndReload = () => {
    try {
      localStorage.clear();
    } catch {
      /* private mode */
    }
    this.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    const message = this.state.error.message || String(this.state.error);
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="max-w-md space-y-4 rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-left shadow-sm">
          <h1 className="text-lg font-semibold text-foreground">Something went wrong</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Openbentt hit an unexpected error while rendering. Your API key and chats are safe in
            this browser. Try reloading, and if the issue persists, clear local state.
          </p>
          <pre className="max-h-40 overflow-auto rounded-md bg-muted/50 p-3 font-mono text-[11px] leading-snug text-foreground">
            {message}
          </pre>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={this.reload}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted/50"
            >
              Reload
            </button>
            <button
              type="button"
              onClick={this.clearAndReload}
              className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/15"
            >
              Clear local data & reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
