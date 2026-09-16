/**
 * Shared hardening helpers for the zero-dependency helper servers
 * (server/research-proxy.mjs, server/latex-compile.mjs). Phase 1 foundation.
 *
 * No npm dependencies — plain node:http primitives only.
 */

/** Parse a comma-separated env allowlist into exact origin strings. */
export function parseAllowedOrigins(raw) {
  return String(raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function isLoopbackHost(hostname) {
  const h = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
  return h === "localhost" || h === "127.0.0.1" || h === "::1";
}

/**
 * Decide whether a request's Origin may use the endpoint.
 *
 * Allowed: missing/`null` origin (curl, server-side Vite proxy, sandboxed
 * Electron contexts), same-origin (Host match — covers nginx deployments via
 * `proxy_set_header Host $host`), loopback origins, `app://openbentt`
 * (packaged Electron), and exact entries of the operator allowlist.
 *
 * These endpoints carry no ambient authority (no cookies/sessions), so the
 * residual risk of the permissive cases is quota abuse — bounded separately
 * by the in-process rate limiter. Denied origins get a 403 before any work.
 */
export function isOriginAllowed(req, allowedOrigins = []) {
  const headers = req?.headers ?? {};
  const origin = headers.origin;
  if (!origin || origin === "null") return true;
  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  const hostHeader = String(headers.host ?? "").toLowerCase();
  if (hostHeader && parsed.host.toLowerCase() === hostHeader) return true;
  if (parsed.protocol === "app:" && parsed.hostname === "openbentt") return true;
  if ((parsed.protocol === "http:" || parsed.protocol === "https:") && isLoopbackHost(parsed.hostname)) {
    return true;
  }
  const needle = origin.toLowerCase();
  return allowedOrigins.some((a) => String(a).toLowerCase() === needle);
}

/** CORS response headers for an allowed request (reflected origin + Vary). */
export function corsHeadersFor(req, allowedOrigins = []) {
  const headers = req?.headers ?? {};
  const origin = headers.origin;
  const out = { Vary: "Origin" };
  if (typeof origin === "string" && origin !== "null" && isOriginAllowed(req, allowedOrigins)) {
    out["Access-Control-Allow-Origin"] = origin;
  }
  return out;
}

/** Best-effort client identity for rate limiting (nginx sets X-Real-IP). */
export function clientIp(req) {
  const headers = req?.headers ?? {};
  const real = String(headers["x-real-ip"] ?? "").trim();
  if (real) return real;
  const fwd = String(headers["x-forwarded-for"] ?? "").split(",")[0].trim();
  if (fwd) return fwd;
  return req?.socket?.remoteAddress ?? "unknown";
}

/** Sliding-window in-process rate limiter (no Redis by design). */
export function createRateLimiter({ perMin = 120, windowMs = 60_000 } = {}) {
  const hits = new Map();
  return {
    check(ip) {
      const now = Date.now();
      const key = String(ip ?? "unknown");
      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      if (recent.length >= perMin) {
        hits.set(key, recent);
        return { ok: false, retryAfterMs: Math.max(1, windowMs - (now - recent[0])) };
      }
      recent.push(now);
      hits.set(key, recent);
      if (hits.size > 2000) {
        for (const [k, v] of hits) {
          if (v.length === 0 || now - v[v.length - 1] > windowMs) hits.delete(k);
        }
      }
      return { ok: true };
    },
  };
}

/**
 * Read a request body with a hard cap. Destroys the socket on overflow so a
 * malicious uploader cannot trickle bytes indefinitely.
 * Rejects with an Error carrying `.status = 413` when over the cap.
 */
export function readBodyCapped(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    req.on("data", (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > maxBytes) {
        settled = true;
        try {
          req.destroy();
        } catch {
          /* ignore */
        }
        reject(Object.assign(new Error("request body too large"), { status: 413 }));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!settled) {
        settled = true;
        resolve(Buffer.concat(chunks));
      }
    });
    req.on("error", (err) => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    });
  });
}

/** fetch with a hard upstream timeout (AbortSignal.timeout, Node 18+). */
export async function fetchWithTimeout(url, opts = {}, ms = 15_000) {
  return fetch(url, { ...opts, signal: AbortSignal.timeout(ms) });
}

export function sendJson(res, status, obj, extraHeaders = {}) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...extraHeaders });
  res.end(body);
}
