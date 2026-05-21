import React, { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { getDesktopApi } from "@/lib/desktopApi";
import { isDesktopApp } from "@/lib/isDesktopApp";

/**
 * Non-blocking toast when a background update check finds a newer release.
 * Full controls remain in Settings → Desktop app updates.
 */
export function DesktopUpdateNotifier() {
  const { toast } = useToast();
  const notifiedRef = useRef<string | null>(null);
  const api = getDesktopApi();

  useEffect(() => {
    if (!isDesktopApp() || !api?.onUpdateStatus) return;

    return api.onUpdateStatus((status) => {
      if (status.phase === "available" && status.version) {
        if (notifiedRef.current === status.version) return;
        notifiedRef.current = status.version;
        toast({
          title: `Update available — v${status.version}`,
          description: "Open Settings → General to download and install when ready.",
          duration: 12_000,
          action: (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              onClick={() => void api.downloadUpdate?.()}
            >
              Download
            </Button>
          ),
        });
      }

      if (status.phase === "downloaded" && status.version) {
        toast({
          title: "Update ready to install",
          description: `v${status.version} downloaded. Restart to apply.`,
          duration: 15_000,
          action: (
            <Button type="button" size="sm" className="h-8" onClick={() => void api.installUpdate?.()}>
              Restart
            </Button>
          ),
        });
      }
    });
  }, [api, toast]);

  return null;
}
