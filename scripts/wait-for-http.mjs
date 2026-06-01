#!/usr/bin/env node

const urls = process.argv.slice(2);
const timeoutMs = Number(process.env.OPENBENTT_WAIT_TIMEOUT_MS ?? 60_000);
const intervalMs = Number(process.env.OPENBENTT_WAIT_INTERVAL_MS ?? 500);

if (urls.length === 0) {
  console.error("Usage: node scripts/wait-for-http.mjs <url> [url...]");
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function isReady(url) {
  try {
    const res = await fetch(url, { cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

const deadline = Date.now() + timeoutMs;
const pending = new Set(urls);

while (pending.size > 0 && Date.now() < deadline) {
  for (const url of [...pending]) {
    if (await isReady(url)) {
      console.log(`[wait-for-http] ready: ${url}`);
      pending.delete(url);
    }
  }
  if (pending.size > 0) {
    await sleep(intervalMs);
  }
}

if (pending.size > 0) {
  console.error(`[wait-for-http] timed out waiting for: ${[...pending].join(", ")}`);
  process.exit(1);
}
