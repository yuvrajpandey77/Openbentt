/**
 * Neon-backed download signup store (shared by Vercel Edge API + local Vite middleware).
 * Uses @neondatabase/serverless HTTP driver — correct for Edge / serverless.
 */

import { neon } from "@neondatabase/serverless";

/**
 * @param {string} databaseUrl pooled or direct Neon URL
 * @param {{
 *   email: string;
 *   platform: string;
 *   assetId: string;
 *   source: string;
 *   version: string;
 *   interests: string[];
 *   ts: string;
 * }} lead
 */
export async function upsertDownloadSignup(databaseUrl, lead) {
  const sql = neon(databaseUrl);

  await sql`
    CREATE TABLE IF NOT EXISTS download_signups (
      email TEXT PRIMARY KEY,
      platform TEXT,
      asset_id TEXT,
      source TEXT,
      version TEXT,
      interests TEXT[] DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `;

  await sql`
    INSERT INTO download_signups (email, platform, asset_id, source, version, interests, updated_at)
    VALUES (
      ${lead.email},
      ${lead.platform},
      ${lead.assetId},
      ${lead.source},
      ${lead.version},
      ${lead.interests},
      ${lead.ts}::timestamptz
    )
    ON CONFLICT (email) DO UPDATE SET
      platform = EXCLUDED.platform,
      asset_id = EXCLUDED.asset_id,
      source = EXCLUDED.source,
      version = EXCLUDED.version,
      interests = EXCLUDED.interests,
      updated_at = EXCLUDED.updated_at
  `;
}

/** @param {string} databaseUrl */
export async function getDownloadSignup(databaseUrl, email) {
  const sql = neon(databaseUrl);
  const rows = await sql`
    SELECT email, platform, asset_id, source, version, interests, created_at, updated_at
    FROM download_signups
    WHERE email = ${email}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

/** @param {string} databaseUrl */
export async function countDownloadSignups(databaseUrl) {
  const sql = neon(databaseUrl);
  const rows = await sql`SELECT COUNT(*)::int AS n FROM download_signups`;
  return rows[0]?.n ?? 0;
}
