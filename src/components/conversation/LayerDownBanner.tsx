import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useChat } from "@/context/ChatContext";
import { hasOpenCodeDesktopApi, openCodeAgentApi } from "@/lib/agent/openCodeAgentApi";
import { isDesktopApp } from "@/lib/isDesktopApp";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

/**
 * Desktop layer-down state: ONE clear banner with a one-click fix —
 * never the provider maze. Web keeps its own key-based hint elsewhere.
 */
export const LayerDownBanner: React.FC = () => {
  const { openCodeLayer, refreshOpenCodeLayer } = useChat();
  const [busy, setBusy] = useState(false);

  if (!isDesktopApp() || !hasOpenCodeDesktopApi()) return null;
  if (openCodeLayer.available || openCodeLayer.checking) return null;

  const start = async () => {
    setBusy(true);
    try {
      await openCodeAgentApi.ensureRuntime();
    } catch {
      /* surfaced via refresh */
    } finally {
      await refreshOpenCodeLayer();
      setBusy(false);
    }
  };

  return (
    <Alert variant="default" className="border-amber-500/40 bg-amber-500/5 py-2">
      <AlertTitle className="text-xs">Local agent isn't running</AlertTitle>
      <AlertDescription className="text-[11px]">
        <span className="block text-muted-foreground">
          {openCodeLayer.opencodeInstalled
            ? "OpenCode is installed but its runtime hasn't started. One click brings chat + execution online — no keys needed."
            : "OpenCode isn't installed yet. Install it once, then start the runtime — chat and execution run through it with no keys."}{" "}
          <Link to="/setup" className="font-medium text-primary hover:underline">
            Setup →
          </Link>
        </span>
        <span className="mt-1.5 flex gap-2">
          <Button type="button" size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={() => void start()}>
            {busy && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
            {openCodeLayer.opencodeInstalled ? "Start local runtime" : "Check again"}
          </Button>
        </span>
      </AlertDescription>
    </Alert>
  );
};
