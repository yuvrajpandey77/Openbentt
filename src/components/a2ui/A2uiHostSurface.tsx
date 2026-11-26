/**
 * Host-side A2UI renderer — agent sends layout data; we draw with @a2ui/react.
 */
import React, { useEffect, useMemo, useState } from "react";
import { A2uiSurface } from "@a2ui/react";
import { MessageProcessor } from "@a2ui/web_core";
import { basicCatalog, injectBasicCatalogStyles } from "@a2ui/web_core/catalogs/basic/v1";
import type { A2uiV1Message } from "@/lib/a2ui/permissionMessages";
import { cn } from "@/lib/utils";

let stylesInjected = false;

function ensureA2uiStyles() {
  if (stylesInjected || typeof document === "undefined") return;
  try {
    injectBasicCatalogStyles();
    // Map A2UI tokens onto Openbentt theme so cards match the rest of the app.
    const root = document.documentElement;
    root.style.setProperty("--a2ui-color-surface", "hsl(var(--card))");
    root.style.setProperty("--a2ui-color-on-surface", "hsl(var(--card-foreground))");
    root.style.setProperty("--a2ui-color-primary", "hsl(var(--primary))");
    root.style.setProperty("--a2ui-color-on-primary", "hsl(var(--primary-foreground))");
    root.style.setProperty("--a2ui-color-outline", "hsl(var(--border))");
    root.style.setProperty("--a2ui-color-background", "hsl(var(--background))");
    root.style.setProperty("--a2ui-color-on-background", "hsl(var(--foreground))");
    stylesInjected = true;
  } catch {
    /* styles are best-effort */
  }
}

type Props = {
  surfaceId: string;
  messages: A2uiV1Message[];
  onAction?: (name: string) => void;
  className?: string;
};

export const A2uiHostSurface: React.FC<Props> = ({ surfaceId, messages, onAction, className }) => {
  const processor = useMemo(() => new MessageProcessor([basicCatalog]), []);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ensureA2uiStyles();
  }, []);

  useEffect(() => {
    setError(null);
    setReady(false);
    try {
      if (processor.model.surfacesMap.has(surfaceId)) {
        try {
          processor.processMessages([
            { version: "1.0", deleteSurface: { surfaceId } },
          ] as Parameters<typeof processor.processMessages>[0]);
        } catch {
          /* recreate below */
        }
      }
      processor.processMessages(messages as Parameters<typeof processor.processMessages>[0]);
      setReady(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "A2UI surface failed");
    }
  }, [processor, surfaceId, messages]);

  useEffect(() => {
    if (!onAction) return;
    const surface = processor.model.surfacesMap.get(surfaceId);
    if (!surface) return;
    const sub = surface.onAction.subscribe((payload: { name?: string }) => {
      const name = typeof payload?.name === "string" ? payload.name : "";
      if (name) onAction(name);
    });
    return () => {
      try {
        sub.unsubscribe();
      } catch {
        /* ignore */
      }
    };
  }, [processor, surfaceId, onAction, ready]);

  const surface = ready ? processor.model.surfacesMap.get(surfaceId) : undefined;

  if (error) {
    return (
      <div className={cn("rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-xs", className)}>
        {error}
      </div>
    );
  }

  if (!surface) return null;

  return (
    <div
      className={cn(
        "a2ui-host overflow-hidden rounded-xl border border-border/80 bg-card/80 p-1 shadow-sm ring-1 ring-black/5 dark:ring-white/10",
        className
      )}
      data-a2ui-surface={surfaceId}
    >
      <A2uiSurface surface={surface} />
    </div>
  );
};
