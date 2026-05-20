import { Analytics } from "@vercel/analytics/react";
import { isAnalyticsAllowed } from "@/lib/privacy/privacyPreferences";

/**
 * Vercel Analytics — only when the user explicitly opts in (Settings → Privacy).
 */
export function PrivacyAnalytics() {
  if (!isAnalyticsAllowed()) return null;
  return <Analytics />;
}
