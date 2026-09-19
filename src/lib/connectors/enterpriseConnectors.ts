/**
 * Phase 7 — Tier-1 enterprise connector metadata (pure data, no secrets).
 *
 * Every entry references the provider's REAL official API: base URLs used by
 * the provider clients in ./providers/*. Every connector is READ_ONLY in
 * Phase 7; write scopes are listed explicitly as DEFERRED and are never
 * requested by the OAuth flow.
 */

export interface EnterpriseConnectorMeta {
  id: string;
  name: string;
  provider: string;
  description: string;
  /** Official API base used by the real client. */
  apiBase: string;
  /** OAuth endpoints (Google shared by Drive/Gmail/Calendar). */
  oauth: {
    authorizeUrl: string;
    tokenUrl: string;
    revokeUrl?: string;
  };
  /** Least-privilege scopes requested (read-only). */
  scopes: string[];
  /** Write scopes we deliberately DO NOT request in Phase 7. */
  deferredWriteScopes: string[];
  supportedResources: string[];
  rateLimitNote: string;
  docsUrl: string;
  riskLevel: "LOW" | "MEDIUM";
}

export const ENTERPRISE_CONNECTOR_META: Record<string, EnterpriseConnectorMeta> = {
  "google-drive": {
    id: "google-drive",
    name: "Google Drive",
    provider: "google",
    description: "Drive files and folders via Drive API v3 (read-only).",
    apiBase: "https://www.googleapis.com/drive/v3",
    oauth: {
      authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      revokeUrl: "https://oauth2.googleapis.com/revoke",
    },
    scopes: [
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/drive.metadata.readonly",
    ],
    deferredWriteScopes: ["https://www.googleapis.com/auth/drive"],
    supportedResources: ["folder", "document", "spreadsheet", "presentation", "pdf", "text", "file"],
    rateLimitNote: "Per-user rate limits; client pages (max 100/page) with bounded single retry on 429.",
    docsUrl: "https://developers.google.com/drive/api/reference/rest/v3",
    riskLevel: "MEDIUM",
  },
  gmail: {
    id: "gmail",
    name: "Gmail",
    provider: "google",
    description: "Threads and messages via Gmail API v1 (read-only).",
    apiBase: "https://gmail.googleapis.com/gmail/v1",
    oauth: {
      authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      revokeUrl: "https://oauth2.googleapis.com/revoke",
    },
    scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
    deferredWriteScopes: [
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.modify",
    ],
    supportedResources: ["thread", "message", "attachment"],
    rateLimitNote: "250 quota units/user/sec; bounded message bodies; single retry on 429.",
    docsUrl: "https://developers.google.com/gmail/api/reference/rest",
    riskLevel: "MEDIUM",
  },
  "google-calendar": {
    id: "google-calendar",
    name: "Google Calendar",
    provider: "google",
    description: "Calendars and events via Calendar API v3 (read-only).",
    apiBase: "https://www.googleapis.com/calendar/v3",
    oauth: {
      authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      revokeUrl: "https://oauth2.googleapis.com/revoke",
    },
    scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
    deferredWriteScopes: ["https://www.googleapis.com/auth/calendar"],
    supportedResources: ["calendar", "event"],
    rateLimitNote: "Per-user rate limits; time-bounded event windows; single retry on 429.",
    docsUrl: "https://developers.google.com/calendar/api/v3/reference",
    riskLevel: "LOW",
  },
  slack: {
    id: "slack",
    name: "Slack",
    provider: "slack",
    description: "Channels and messages via Slack Web API (read-only).",
    apiBase: "https://slack.com/api",
    oauth: {
      authorizeUrl: "https://slack.com/oauth/v2/authorize",
      tokenUrl: "https://slack.com/api/oauth.v2.access",
    },
    scopes: ["channels:history", "channels:read", "groups:history", "groups:read", "users:read", "search:read"],
    deferredWriteScopes: ["chat:write", "channels:manage"],
    supportedResources: ["channel", "message", "thread", "user"],
    rateLimitNote: "Tier-based rate limits; honors Retry-After with bounded single retry.",
    docsUrl: "https://api.slack.com/methods",
    riskLevel: "MEDIUM",
  },
  github: {
    id: "github",
    name: "GitHub",
    provider: "github",
    description: "Repos, issues, PRs, commits, files via GitHub REST API (read-only).",
    apiBase: "https://api.github.com",
    oauth: {
      authorizeUrl: "https://github.com/login/oauth/authorize",
      tokenUrl: "https://github.com/login/oauth/access_token",
    },
    scopes: ["repo:status", "read:org", "read:user", "public_repo"],
    deferredWriteScopes: ["repo", "write:org", "delete_repo"],
    supportedResources: ["repository", "issue", "pull_request", "commit", "file", "discussion"],
    rateLimitNote: "5000 req/hr authenticated; honors X-RateLimit + Retry-After; conditional requests where supported.",
    docsUrl: "https://docs.github.com/en/rest",
    riskLevel: "LOW",
  },
  notion: {
    id: "notion",
    name: "Notion",
    provider: "notion",
    description: "Pages, databases and blocks via Notion API v1 (read-only).",
    apiBase: "https://api.notion.com/v1",
    oauth: {
      authorizeUrl: "https://api.notion.com/v1/oauth/authorize",
      tokenUrl: "https://api.notion.com/v1/oauth/token",
    },
    scopes: [],
    deferredWriteScopes: ["update_content", "insert_content"],
    supportedResources: ["page", "database", "block"],
    rateLimitNote: "~3 req/sec average; cursor pagination; single retry on 429.",
    docsUrl: "https://developers.notion.com/reference/intro",
    riskLevel: "LOW",
  },
};

export function getEnterpriseMeta(id: string): EnterpriseConnectorMeta {
  const meta = ENTERPRISE_CONNECTOR_META[id];
  if (!meta) throw new Error(`Unknown enterprise connector: ${String(id ?? "").slice(0, 64)}`);
  return meta;
}

export function listEnterpriseMeta(): EnterpriseConnectorMeta[] {
  return Object.values(ENTERPRISE_CONNECTOR_META);
}
