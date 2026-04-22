import React, { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Gauge } from "lucide-react";
import { useChat } from "@/context/ChatContext";
import { canSendChat } from "@/types/chat";
import { fetchOpenRouterKeyInfo } from "@/lib/openrouterKeyInfo";
import {
  parseRequestWindow,
  PROVIDER_LABEL,
} from "@/lib/providerRateLimits";
import { isFreeModelId } from "@/lib/openrouter";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

function formatCredits(remaining: number | null | undefined, limit: number | null | undefined): string | null {
  if (remaining == null && limit == null) return null;
  if (remaining != null && limit != null) return `${remaining.toFixed(2)} / ${limit.toFixed(2)} credits`;
  if (remaining != null) return `${remaining.toFixed(2)} credits left`;
  if (limit != null) return `Limit ${limit.toFixed(2)} credits`;
  return null;
}

/** Live provider usage: OpenRouter key poll + rate-limit headers from last response (current provider only). */
export const ProviderQuotaMeter: React.FC = () => {
  const { apiConfig, providerQuotaSnapshot } = useChat();
  const limitMsg = providerQuotaSnapshot?.limitMessage;
  const limitStatus = providerQuotaSnapshot?.httpStatus;
  const queryClient = useQueryClient();

  const enabled = canSendChat(apiConfig) && apiConfig.aiProvider === "openrouter";

  const { data: keyInfo, isFetching: keyLoading } = useQuery({
    queryKey: ["openrouter-key", apiConfig.apiKey?.slice(-8) ?? ""],
    queryFn: () => fetchOpenRouterKeyInfo(apiConfig.apiKey),
    enabled,
    staleTime: 30_000,
    refetchInterval: 45_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (apiConfig.aiProvider !== "openrouter") return;
    if (limitStatus === 429 || limitStatus === 402) {
      void queryClient.invalidateQueries({ queryKey: ["openrouter-key"] });
    }
  }, [limitStatus, apiConfig.aiProvider, queryClient]);

  if (!canSendChat(apiConfig)) return null;

  const p = apiConfig.aiProvider;

  const headers = providerQuotaSnapshot?.rateLimitHeaders ?? {};
  const reqWindow = parseRequestWindow(headers);
  const headerKeys = Object.keys(headers);

  const creditsLine =
    p === "openrouter" && keyInfo
      ? formatCredits(
          typeof keyInfo.limit_remaining === "number" ? keyInfo.limit_remaining : null,
          typeof keyInfo.limit === "number" ? keyInfo.limit : null
        )
      : null;

  const freeModel = isFreeModelId(apiConfig.model);

  const ratio =
    reqWindow && reqWindow.limit > 0 ? Math.min(1, Math.max(0, reqWindow.remaining / reqWindow.limit)) : null;

  const hasLimitIssue = Boolean(limitMsg);

  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            "relative flex h-9 max-w-[min(220px,42vw)] shrink-0 items-center gap-1.5 overflow-hidden rounded-md border px-2 pb-1 pt-1 text-left text-[10px] leading-none transition-colors",
            "border-border/60 bg-muted/30 hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            hasLimitIssue && "border-destructive/50 bg-destructive/[0.08]"
          )}
          aria-label={`Provider usage: ${PROVIDER_LABEL[p]}. Hover or focus for details.`}
        >
          <Gauge className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 truncate font-medium text-foreground">{PROVIDER_LABEL[p]}</span>
          {freeModel && (
            <span className="shrink-0 rounded bg-primary/15 px-1 py-px text-[9px] font-semibold uppercase text-primary">
              :free
            </span>
          )}
          {hasLimitIssue && (
            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden title={limitMsg} />
          )}
          {reqWindow && (
            <span className="ml-auto shrink-0 font-mono text-[9px] tabular-nums text-foreground">
              {reqWindow.remaining}/{reqWindow.limit}
            </span>
          )}
          {ratio != null && reqWindow && (
            <span className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 rounded-b-md bg-muted/80" aria-hidden>
              <span
                className={`block h-full rounded-b-md ${reqWindow.remaining <= 0 ? "bg-destructive" : "bg-primary"}`}
                style={{ width: `${ratio * 100}%` }}
              />
            </span>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="end" className="max-w-md border-border/80 bg-popover px-3 py-2.5 text-xs shadow-lg">
        <div className="space-y-2 text-left text-muted-foreground">
          <div className="flex flex-wrap items-center gap-1.5 font-medium text-foreground">
            <Gauge className="h-3.5 w-3.5 text-primary" aria-hidden />
            {PROVIDER_LABEL[p]}
            {freeModel && (
              <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary">
                :free
              </span>
            )}
          </div>

          {limitMsg && (
            <p
              className={cn(
                "rounded border px-2 py-1.5 text-[11px] leading-snug",
                limitStatus === 429
                  ? "border-destructive/50 bg-destructive/10 text-destructive"
                  : "border-amber-600/40 bg-amber-500/10 text-amber-900 dark:text-amber-100"
              )}
            >
              <span className="font-semibold">{limitStatus === 429 ? "Limit reached" : "Request failed"}:</span>{" "}
              <span className="whitespace-pre-wrap break-words">{limitMsg}</span>
            </p>
          )}

          {p === "openrouter" && (
            <div className="space-y-1 text-[11px]">
              {keyLoading && !keyInfo && <p className="opacity-80">Loading account…</p>}
              {creditsLine && <p>Credits: {creditsLine}</p>}
              {keyInfo && typeof keyInfo.usage === "number" && (
                <p className="opacity-90">All-time usage: {keyInfo.usage.toFixed(4)} credits</p>
              )}
              {keyInfo && typeof keyInfo.usage_daily === "number" && (
                <p className="opacity-90">Usage today: {keyInfo.usage_daily.toFixed(4)} credits</p>
              )}
              {keyInfo?.is_free_tier === true && (
                <p className="text-amber-700 dark:text-amber-400">Account: free tier (OpenRouter)</p>
              )}
            </div>
          )}

          {reqWindow && (
            <div className="space-y-1">
              <div className="flex justify-between gap-3 text-[11px]">
                <span>Request window</span>
                <span className="shrink-0 font-mono text-foreground">
                  {reqWindow.remaining} / {reqWindow.limit}
                </span>
              </div>
              {ratio != null && (
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full transition-[width] ${
                      reqWindow.remaining <= 0 ? "bg-destructive" : "bg-primary"
                    }`}
                    style={{ width: `${ratio * 100}%` }}
                  />
                </div>
              )}
            </div>
          )}

          {headerKeys.length > 0 && !reqWindow && (
            <div className="max-h-32 overflow-y-auto font-mono text-[10px] leading-relaxed">
              {headerKeys.map((k) => (
                <div key={k} className="break-all">
                  <span className="text-foreground">{k}:</span> {headers[k]}
                </div>
              ))}
            </div>
          )}

          {p !== "openrouter" && headerKeys.length === 0 && p !== "google" && p !== "webgpu_gemma" && (
            <p className="text-[11px] opacity-80">Send a message to load limits from response headers.</p>
          )}

          {p === "webgpu_gemma" && (
            <p className="text-[11px] opacity-80">On-device inference — no cloud quota. First reply downloads model weights once.</p>
          )}

          {p === "google" && (
            <p className="text-[11px] opacity-80">
              Gemini uses the Google SDK; check usage in Google AI Studio — HTTP rate-limit headers are not exposed here.
            </p>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
};
