#!/usr/bin/env node
/**
 * End-to-end proof that Neon download_signups works.
 * Usage: node --env-file=.env.local scripts/verify-download-signup.mjs
 * Optional: SIGNUP_API_URL=http://127.0.0.1:8080/api/download-signup
 */

import {
  countDownloadSignups,
  getDownloadSignup,
  upsertDownloadSignup,
} from "../server/downloadSignupsDb.mjs";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error("FAIL: DATABASE_URL missing (run `neon deploy` or load .env.local)");
  process.exit(1);
}

const email = `neon-verify-${Date.now()}@openbentt.test`;
const lead = {
  email,
  platform: "linux",
  assetId: "linux-appimage",
  source: "verify_script",
  version: "2.6.4",
  interests: ["updates", "cogerphere"],
  ts: new Date().toISOString(),
};

console.log("1) Direct Neon upsert…");
await upsertDownloadSignup(databaseUrl, lead);
const row = await getDownloadSignup(databaseUrl, email);
if (!row || row.email !== email) {
  console.error("FAIL: row not found after upsert", row);
  process.exit(1);
}
console.log("   OK:", { email: row.email, platform: row.platform, asset_id: row.asset_id });

const apiUrl = process.env.SIGNUP_API_URL?.trim();
if (apiUrl) {
  console.log(`2) HTTP POST ${apiUrl}…`);
  const apiEmail = `neon-api-${Date.now()}@openbentt.test`;
  const res = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: apiEmail,
      platform: "mac",
      assetId: "mac-dmg",
      source: "verify_http",
      version: "2.6.4",
      interests: ["updates"],
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok || !body.stored) {
    console.error("FAIL: API response", res.status, body);
    process.exit(1);
  }
  const apiRow = await getDownloadSignup(databaseUrl, apiEmail);
  if (!apiRow) {
    console.error("FAIL: API said stored but row missing");
    process.exit(1);
  }
  console.log("   OK:", { status: res.status, backends: body.backends, email: apiRow.email });
} else {
  console.log("2) SKIP HTTP (set SIGNUP_API_URL to test the running app)");
}

const n = await countDownloadSignups(databaseUrl);
console.log(`3) download_signups count = ${n}`);
console.log("PASS: Neon download signup path works");
