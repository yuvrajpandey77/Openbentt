import React from "react";
import { X, RotateCcw, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { normalizeProviderError, NormalizedError, ERROR_MESSAGES } from "@/lib/errors/normalizedErrors";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface ErrorCardProps {
  error: unknown;
  provider: string;
  model: string;
  onRetry?: () => void;
  onChooseModel?: () => void;
  onOpenSettings?: () => void;
  onDismiss?: () => void;
}

/**
 * Structured error card that displays normalized provider errors
 * with actionable buttons and collapsible technical details.
 */
export const ErrorCard: React.FC<ErrorCardProps> = ({
  error,
  provider,
  model,
  onRetry,
  onChooseModel,
  onOpenSettings,
  onDismiss,
}) => {
  const normalized = normalizeProviderError(error, provider, model);
  const msg = ERROR_MESSAGES[normalized.code];

  return (
    <div
      role="alert"
      className={cn(
        "rounded-xl border p-4",
        normalized.code === "RATE_LIMITED" || normalized.code === "AUTH_REQUIRED"
          ? "border-destructive/50 bg-destructive/5"
          : normalized.code === "LOCAL_RUNTIME_UNAVAILABLE" || normalized.code === "MODEL_NOT_FOUND"
            ? "border-amber-500/50 bg-amber-500/5"
            : "border-border/60 bg-card"
      )}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="shrink-0 mt-0.5 h-5 w-5 text-destructive" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium text-foreground">{msg.title}</p>
            {onDismiss && (
              <button
                type="button"
                onClick={onDismiss}
                className="shrink-0 text-muted-foreground hover:text-foreground"
                aria-label="Dismiss error"
              >
                <X size={16} />
              </button>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{msg.description}</p>
          <p className="mt-1 text-sm font-medium text-foreground">{normalized.message}</p>

          <div className="mt-3 flex flex-wrap gap-2">
            {normalized.code === "MODEL_NOT_FOUND" && onChooseModel && (
              <Button variant="outline" size="sm" onClick={onChooseModel}>
                Choose another model
              </Button>
            )}
            {normalized.code === "LOCAL_RUNTIME_UNAVAILABLE" && onOpenSettings && (
              <Button variant="outline" size="sm" onClick={onOpenSettings}>
                Open Local AI settings
              </Button>
            )}
            {(normalized.code === "AUTH_REQUIRED" || normalized.code === "AUTH_EXPIRED") && onOpenSettings && (
              <Button variant="outline" size="sm" onClick={onOpenSettings}>
                Update API key
              </Button>
            )}
            {onRetry && (
              <Button size="sm" variant="secondary" onClick={onRetry}>
                <RotateCcw size={12} className="mr-1" />
                Retry
              </Button>
            )}
          </div>

          {/* Technical details collapsible */}
          <Collapsible open={false}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground"
              >
                <ChevronDown size={12} className="shrink-0" />
                Show technical details
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 rounded-lg border border-border/60 bg-muted/30 p-3 text-[10px] font-mono text-muted-foreground">
              <div className="space-y-1">
                <div><span className="font-medium">Code:</span> {normalized.code}</div>
                <div><span className="font-medium">Provider:</span> {normalized.details?.provider ?? "unknown"}</div>
                <div><span className="font-medium">Model:</span> {normalized.details?.model ?? model}</div>
                {normalized.details?.statusCode && (
                  <div><span className="font-medium">Status:</span> {normalized.details.statusCode}</div>
                )}
                {normalized.details?.rawError && (
                  <div>
                    <span className="font-medium">Raw:</span>
                    <pre className="mt-1 whitespace-pre-wrap break-all">{normalized.details.rawError}</pre>
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>
    </div>
  );
};

export default ErrorCard;