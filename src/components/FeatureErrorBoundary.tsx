import React from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logger } from "@/lib/log";
import { redactSecretsInText } from "@/lib/privacy/redactForLogs";
import { getDesktopApi } from "@/lib/desktopApi";

interface FeatureErrorBoundaryProps {
  /** Feature label shown in the fallback (e.g. "chat", "notebook"). */
  feature: string;
  children: React.ReactNode;
}

interface FeatureErrorBoundaryState {
  error: Error | null;
  errorId: string | null;
}

function newErrorId(): string {
  try {
    return `ERR-${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffffff).toString(36)}`;
  } catch {
    return "ERR-unknown";
  }
}

/**
 * Per-feature failure isolation (Phase 1). A crash in one workspace must not
 * unmount the whole app. Diagnostics are redacted and truncated; recovery is
 * offered via in-place retry and full reload. The root ErrorBoundary in App.tsx
 * remains as the last resort.
 */
export class FeatureErrorBoundary extends React.Component<
  FeatureErrorBoundaryProps,
  FeatureErrorBoundaryState
> {
  state: FeatureErrorBoundaryState = { error: null, errorId: null };

  static getDerivedStateFromError(error: Error): FeatureErrorBoundaryState {
    return { error, errorId: newErrorId() };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    const stackFirstLines = String(info?.componentStack ?? "")
      .split("\n")
      .slice(0, 3)
      .join("\n");
    logger.error("error-boundary", `feature crash: ${this.props.feature}`, {
      errorId: this.state.errorId,
      errorName: error?.name,
      // Message + stack go through the shared redaction boundary.
      message: redactSecretsInText(String(error?.message ?? error)).slice(0, 300),
      componentStack: stackFirstLines.slice(0, 500),
    });
  }

  private handleRetry = (): void => {
    this.setState({ error: null, errorId: null });
  };

  private handleReload = (): void => {
    try {
      const api = getDesktopApi();
      if (api?.reloadPage) {
        void api.reloadPage();
        return;
      }
    } catch {
      /* fall through to location.reload */
    }
    window.location.reload();
  };

  render(): React.ReactNode {
    const { error, errorId } = this.state;
    if (!error) return this.props.children;
    const safeMessage = redactSecretsInText(String(error.message || "Something went wrong")).slice(0, 300);
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-6" role="alert">
        <div className="w-full max-w-md space-y-3 rounded-xl border border-destructive/40 bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle size={18} aria-hidden />
            <h2 className="text-sm font-semibold">
              {this.props.feature} ran into a problem
            </h2>
          </div>
          <p className="break-words text-xs leading-relaxed text-muted-foreground">{safeMessage}</p>
          {errorId ? (
            <p className="font-mono text-[10px] text-muted-foreground">Reference: {errorId}</p>
          ) : null}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button type="button" size="sm" onClick={this.handleRetry}>
              Try again
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={this.handleReload}>
              Reload app
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Your chats, projects, and files are stored locally and are unaffected — this only resets the current view.
          </p>
        </div>
      </div>
    );
  }
}
