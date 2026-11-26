import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { DownloadSignupDialog } from "@/components/marketing/DownloadSignupDialog";
import {
  shouldAskForDownloadSignup,
  startAssetDownload,
  type DownloadIntent,
} from "@/lib/downloadSignup";
import { trackDownloadClick } from "@/lib/analytics/marketingAnalytics";

type DownloadSignupContextValue = {
  /** Intercept an installer download: optional email dialog, then start the file. */
  requestDownload: (intent: DownloadIntent) => void;
};

const DownloadSignupContext = createContext<DownloadSignupContextValue | null>(null);

export function DownloadSignupProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [intent, setIntent] = useState<DownloadIntent | null>(null);

  const requestDownload = useCallback((next: DownloadIntent) => {
    if (!next.href) return;
    if (!shouldAskForDownloadSignup()) {
      trackDownloadClick({
        assetId: next.assetId,
        platform: next.platform,
        version: next.version,
        source: next.source,
        href: next.href,
      });
      startAssetDownload(next.href);
      return;
    }
    setIntent(next);
    setOpen(true);
  }, []);

  const value = useMemo(() => ({ requestDownload }), [requestDownload]);

  return (
    <DownloadSignupContext.Provider value={value}>
      {children}
      <DownloadSignupDialog open={open} intent={intent} onOpenChange={setOpen} />
    </DownloadSignupContext.Provider>
  );
}

export function useDownloadSignup(): DownloadSignupContextValue {
  const ctx = useContext(DownloadSignupContext);
  if (!ctx) {
    return {
      requestDownload: (intent) => {
        if (!intent.href) return;
        trackDownloadClick({
          assetId: intent.assetId,
          platform: intent.platform,
          version: intent.version,
          source: intent.source,
          href: intent.href,
        });
        startAssetDownload(intent.href);
      },
    };
  }
  return ctx;
}
