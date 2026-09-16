/**
 * Phase 2 — Controlled URL ingestion (no general crawler).
 * Reuses the Phase 1 security model: HTTPS-only, timeout, size cap, redirect
 * limit, content-type validation, SSRF denial for private/loopback/link-local
 * targets, safe errors. No file:/javascript:/data:/blob: support.
 */
import { DOCUMENT_LIMITS } from "@/lib/documents/limits";

export interface ValidatedUrl {
  url: string;
  host: string;
}

export function validateIngestUrl(raw: string): ValidatedUrl {
  if (typeof raw !== "string" || !raw.trim()) throw new Error("url-blocked");
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new Error("url-blocked");
  }
  if (parsed.protocol !== "https:") throw new Error("url-blocked");
  if (parsed.username || parsed.password) throw new Error("url-blocked");
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i);
    if ((code >= 0 && code <= 0x1f) || code === 0x7f) throw new Error("url-blocked");
  }
  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (!host) throw new Error("url-blocked");
  if (isBlockedHost(host)) throw new Error("url-blocked");
  return { url: parsed.toString(), host };
}

function isBlockedHost(host: string): boolean {
  if (host === "localhost") return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const [a, b] = host.split(".").map(Number);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 0) return true;
  }
  // IPv6 loopback/unique-local/link-local + common metadata hosts.
  if (host === "::1" || host === "[::1]" || host.startsWith("fc") || host.startsWith("fd")
    || host.startsWith("fe80") || host === "metadata.google.internal") return true;
  if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".lan")) return true;
  return false;
}

export interface FetchedPage {
  html: string;
  finalUrl: string;
  contentType: string;
}

/** Fetch with timeout + manual redirect chain (maxRedirects) + size cap. */
export async function fetchPageForIngest(
  url: string,
  fetchImpl: typeof fetch = fetch,
  opts?: { timeoutMs?: number; maxBytes?: number; maxRedirects?: number }
): Promise<FetchedPage> {
  const { url: start } = validateIngestUrl(url);
  const timeoutMs = opts?.timeoutMs ?? DOCUMENT_LIMITS.urlFetchTimeoutMs;
  const maxBytes = opts?.maxBytes ?? DOCUMENT_LIMITS.maxUrlResponseBytes;
  const maxRedirects = opts?.maxRedirects ?? DOCUMENT_LIMITS.maxRedirects;
  let current = start;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetchImpl(current, { signal: ctrl.signal, redirect: "manual" });
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof DOMException && err.name === "AbortError") throw new Error("url-timeout");
      throw new Error("url-timeout");
    } finally {
      clearTimeout(timer);
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc || hop === maxRedirects) throw new Error("url-blocked");
      const next = new URL(loc, current).toString();
      validateIngestUrl(next); // re-validates scheme + SSRF on every hop
      current = next;
      continue;
    }
    if (res.status < 200 || res.status >= 300) throw new Error("url-bad-content");
    const contentType = res.headers.get("content-type") ?? "";
    if (!/text\/html/i.test(contentType)) throw new Error("url-bad-content");
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length > maxBytes) throw new Error("url-too-large");
    return { html: new TextDecoder().decode(buf), finalUrl: current, contentType };
  }
  throw new Error("url-blocked");
}
