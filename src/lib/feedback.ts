import { getDesktopApi } from "@/lib/desktopApi";
import { isDesktopApp } from "@/lib/isDesktopApp";

export const SUPPORT_EMAIL = "support@cogerphere.com";
export const CONTACT_PAGE_URL = "https://cogerphere.com/contact";

/** One-line diagnostics attached to every bug report (no private content). */
export function appVersion(): string {
  try {
    return import.meta.env.VITE_APP_VERSION ?? "dev";
  } catch {
    return "dev";
  }
}

export function collectFeedbackDiagnostics(extra?: string): string {
  const lines = [
    `app: openbentt ${appVersion()} (${isDesktopApp() ? "electron" : "web"})`,
    `platform: ${typeof navigator !== "undefined" ? navigator.platform : "unknown"}`,
    `ua: ${typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 160) : "unknown"}`,
    `at: ${new Date().toISOString()}`,
  ];
  if (extra?.trim()) lines.push(`context: ${extra.trim().slice(0, 500)}`);
  return lines.join("\n");
}

export function buildFeedbackMailto(message: string, diagnostics: string): string {
  const subject = encodeURIComponent(`OpenBentt bug report v${appVersion()}`);
  const body = encodeURIComponent(`${message.trim()}\n\n--- diagnostics ---\n${diagnostics}`);
  return `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
}

/** Open the contact page in the OS browser (desktop) or a new tab (web). */
export function openFeedbackContact(): void {
  const api = isDesktopApp() ? getDesktopApi() : undefined;
  if (api?.openExternal) {
    void api.openExternal(CONTACT_PAGE_URL).catch(() => window.open(CONTACT_PAGE_URL, "_blank", "noopener"));
  } else {
    window.open(CONTACT_PAGE_URL, "_blank", "noopener,noreferrer");
  }
}
