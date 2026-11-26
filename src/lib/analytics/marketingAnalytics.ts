import { track as vercelTrack } from "@vercel/analytics";
import { isDesktopApp } from "@/lib/isDesktopApp";

export type MarketingEventProps = Record<string, string | number | boolean | null | undefined>;

type PostHogLike = {
  capture: (event: string, properties?: Record<string, unknown>) => void;
  opt_out_capturing?: () => void;
};

let posthogClient: PostHogLike | null = null;
let initStarted = false;

function posthogKey(): string {
  return (import.meta.env.VITE_POSTHOG_KEY as string | undefined)?.trim() ?? "";
}

function posthogHost(): string {
  return (
    (import.meta.env.VITE_POSTHOG_HOST as string | undefined)?.trim() ||
    "https://us.i.posthog.com"
  );
}

/** True when PostHog is configured for this build. */
export function isPosthogConfigured(): boolean {
  return Boolean(posthogKey());
}

/**
 * Lazy-init PostHog on marketing pages only (not Electron).
 * Safe no-op when `VITE_POSTHOG_KEY` is unset.
 */
export async function initMarketingAnalytics(): Promise<void> {
  if (initStarted || isDesktopApp() || typeof window === "undefined") return;
  const key = posthogKey();
  if (!key) return;
  initStarted = true;

  try {
    const { default: posthog } = await import("posthog-js");
    posthog.init(key, {
      api_host: posthogHost(),
      person_profiles: "identified_only",
      capture_pageview: true,
      capture_pageleave: true,
      persistence: "localStorage+cookie",
      // Marketing-only: no session recording unless you enable it in PostHog project settings.
      disable_session_recording: true,
    });
    posthogClient = posthog;
  } catch (err) {
    console.warn("[analytics] PostHog init failed", err);
    initStarted = false;
  }
}

/** Fire a marketing event to Vercel Analytics + PostHog (when configured). */
export function trackMarketingEvent(name: string, props: MarketingEventProps = {}): void {
  if (isDesktopApp() || typeof window === "undefined") return;

  const clean: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined) continue;
    clean[k] = v;
  }

  try {
    vercelTrack(name, clean);
  } catch {
    /* ignore — Analytics script may not be injected yet */
  }

  try {
    posthogClient?.capture(name, clean);
  } catch {
    /* ignore */
  }
}

export type DownloadTrackSource =
  | "download_page"
  | "hero_cta"
  | "home_cta"
  | "header"
  | "footer"
  | "other";

/** Standard download-click event used across marketing CTAs. */
export function trackDownloadClick(input: {
  assetId: string;
  platform?: string;
  version?: string | null;
  source: DownloadTrackSource;
  href?: string | null;
}): void {
  trackMarketingEvent("download_click", {
    asset_id: input.assetId,
    platform: input.platform ?? "unknown",
    version: input.version ?? null,
    source: input.source,
    href: input.href ? truncate(input.href, 180) : null,
  });
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}
