/**
 * Optional download-update signup (marketing). Soft gate — clients always allow Skip.
 *
 * Storage backends (database preferred when Neon DATABASE_URL is set):
 * - DATABASE_URL — Neon/Postgres upsert into download_signups (pooled URL)
 * - DOWNLOAD_SIGNUP_WEBHOOK_URL — POST JSON lead payload
 * - DOWNLOAD_SIGNUP_DISCORD_WEBHOOK_URL — Discord channel notify (additive)
 */

export const config = { runtime: "edge" };

type Body = {
  email?: string;
  platform?: string;
  assetId?: string;
  source?: string;
  version?: string;
  interests?: string[];
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_BODY = 4_096;

function cors(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8",
  };
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: cors() });
}

function cleanStr(v: unknown, max = 120): string {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors() });
  }
  if (request.method !== "POST") {
    return json(405, { ok: false, error: "method_not_allowed" });
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY) return json(413, { ok: false, error: "too_large" });

  let body: Body;
  try {
    body = JSON.parse(raw) as Body;
  } catch {
    return json(400, { ok: false, error: "invalid_json" });
  }

  const email = cleanStr(body.email, 254).toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return json(400, { ok: false, error: "invalid_email" });
  }

  const interests = Array.isArray(body.interests)
    ? body.interests.map((x) => cleanStr(x, 40)).filter(Boolean).slice(0, 8)
    : [];

  const lead = {
    email,
    platform: cleanStr(body.platform, 40) || "unknown",
    assetId: cleanStr(body.assetId, 80) || "unknown",
    source: cleanStr(body.source, 40) || "download",
    version: cleanStr(body.version, 40) || "",
    interests,
    ts: new Date().toISOString(),
  };

  const databaseUrl = process.env.DATABASE_URL?.trim();
  const webhook = process.env.DOWNLOAD_SIGNUP_WEBHOOK_URL?.trim();
  const discord = process.env.DOWNLOAD_SIGNUP_DISCORD_WEBHOOK_URL?.trim();

  let stored = false;
  const backends: string[] = [];

  if (databaseUrl) {
    try {
      const { upsertDownloadSignup } = await import("../server/downloadSignupsDb.mjs");
      await upsertDownloadSignup(databaseUrl, lead);
      stored = true;
      backends.push("database");
    } catch (err) {
      console.error("[download-signup] neon upsert failed", err);
    }
  }

  if (!stored && webhook) {
    try {
      const r = await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lead),
        signal: AbortSignal.timeout(8_000),
      });
      if (r.ok) {
        stored = true;
        backends.push("webhook");
      }
    } catch {
      /* try other backends */
    }
  }

  if (discord) {
    try {
      const lines = [
        "**Openbentt download signup**",
        `email: \`${lead.email}\``,
        `platform: ${lead.platform} · asset: ${lead.assetId}`,
        lead.version ? `version: ${lead.version}` : null,
        lead.interests.length ? `interests: ${lead.interests.join(", ")}` : null,
        `source: ${lead.source}`,
      ]
        .filter(Boolean)
        .join("\n");
      const r = await fetch(discord, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: lines.slice(0, 1800) }),
        signal: AbortSignal.timeout(8_000),
      });
      if (r.ok) backends.push("discord");
    } catch {
      /* notify is best-effort */
    }
  }

  if (!stored && !discord) {
    return json(503, {
      ok: false,
      error: "not_configured",
      message:
        "Set DATABASE_URL (Neon), DOWNLOAD_SIGNUP_WEBHOOK_URL, or DOWNLOAD_SIGNUP_DISCORD_WEBHOOK_URL.",
    });
  }

  if (!stored && backends.includes("discord")) stored = true;

  return json(200, { ok: true, stored, backends });
}
