import { useEffect } from "react";
import { Analytics } from "@vercel/analytics/react";
import { initMarketingAnalytics, isPosthogConfigured } from "@/lib/analytics/marketingAnalytics";
import { isDesktopApp } from "@/lib/isDesktopApp";

/**
 * Anonymous marketing-site analytics (pageviews + download_click events).
 * - Vercel Web Analytics: always on public web marketing pages (free on Hobby).
 * - PostHog: only when `VITE_POSTHOG_KEY` is set at build time.
 * Desktop Electron never loads this (MarketingShell is web-only, but we guard anyway).
 *
 * In-app workspace telemetry stays opt-in via PrivacyAnalytics / Settings.
 */
export function MarketingAnalytics() {
  useEffect(() => {
    if (isDesktopApp()) return;
    void initMarketingAnalytics();
  }, []);

  if (isDesktopApp()) return null;

  return (
    <>
      <Analytics />
      {isPosthogConfigured() ? (
        <span className="sr-only" data-analytics="posthog" aria-hidden>
          PostHog enabled
        </span>
      ) : null}
    </>
  );
}
