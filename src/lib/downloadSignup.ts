import { trackMarketingEvent, type DownloadTrackSource } from "@/lib/analytics/marketingAnalytics";

const PREF_KEY = "openbentt-download-signup-v1";

export type DownloadSignupPrefs = {
  /** User already shared an email — don't ask again. */
  signedUpEmail?: string;
  /** User chose skip; ask again after this ISO date (or never if far future). */
  skipUntil?: string;
};

export type DownloadIntent = {
  href: string;
  assetId: string;
  platform?: string;
  version?: string | null;
  source: DownloadTrackSource;
};

export type SignupPayload = {
  email: string;
  interests: string[];
  intent: DownloadIntent;
};

function readPrefs(): DownloadSignupPrefs {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as DownloadSignupPrefs;
  } catch {
    return {};
  }
}

function writePrefs(next: DownloadSignupPrefs): void {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(next));
  } catch {
    /* private mode */
  }
}

/** True when we should show the optional email dialog before starting the download. */
export function shouldAskForDownloadSignup(): boolean {
  if (typeof window === "undefined") return false;
  const prefs = readPrefs();
  if (prefs.signedUpEmail) return false;
  if (prefs.skipUntil) {
    const until = Date.parse(prefs.skipUntil);
    if (!Number.isNaN(until) && until > Date.now()) return false;
  }
  return true;
}

export function rememberDownloadSignup(email: string): void {
  writePrefs({ ...readPrefs(), signedUpEmail: email.trim().toLowerCase() });
}

/** Skip for 30 days so we don't nag every click, but can re-offer later. */
export function rememberDownloadSkip(days = 30): void {
  const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  writePrefs({ ...readPrefs(), skipUntil: until });
}

export function startAssetDownload(href: string): void {
  if (!href) return;
  const a = document.createElement("a");
  a.href = href;
  a.target = "_blank";
  a.rel = "noreferrer";
  a.download = "";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function submitDownloadSignup(payload: SignupPayload): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("/api/download-signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: payload.email,
      interests: payload.interests,
      platform: payload.intent.platform,
      assetId: payload.intent.assetId,
      source: payload.intent.source,
      version: payload.intent.version ?? "",
    }),
  });

  let data: { ok?: boolean; error?: string; message?: string } = {};
  try {
    data = (await res.json()) as typeof data;
  } catch {
    /* ignore */
  }

  if (!res.ok || !data.ok) {
    return { ok: false, error: data.message || data.error || `http_${res.status}` };
  }

  trackMarketingEvent("download_signup", {
    platform: payload.intent.platform ?? "unknown",
    asset_id: payload.intent.assetId,
    source: payload.intent.source,
    interests: payload.interests.join(",") || null,
  });

  return { ok: true };
}
