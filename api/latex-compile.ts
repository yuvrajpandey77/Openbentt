/**
 * Vercel Edge: forwards POST body (.tex) to LATEX_UPSTREAM_URL (your pdflatex service).
 * Set in Vercel → Environment Variables (not VITE_*): e.g. https://your-latex.railway.app/compile
 *
 * Local dev uses Vite proxy → localhost:8788 instead; this file is unused by `vite dev`.
 *
 * Phase 1 hardening: upstream must be an https: URL (never plain http or an
 * operator-typo'd internal address), request bodies are capped, and the
 * upstream fetch has a hard timeout. Upstream failures surface as generic
 * 502s; upstream PDFs pass through untouched.
 */

export const config = { runtime: "edge" };

const MAX_BODY_BYTES = 8 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 120_000;

function cors(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors() });
  }
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: cors() });
  }

  const upstreamRaw = process.env.LATEX_UPSTREAM_URL?.trim();
  if (!upstreamRaw) {
    return new Response(
      JSON.stringify({
        message:
          "Set LATEX_UPSTREAM_URL in Vercel to your HTTPS pdflatex endpoint (POST text/plain .tex → application/pdf). Example: deploy server/latex-compile.mjs and paste its public /compile URL.",
      }),
      { status: 503, headers: { "Content-Type": "application/json; charset=utf-8", ...cors() } }
    );
  }

  // Phase 1: refuse non-HTTPS upstreams (misconfiguration → credential/plaintext leak).
  let upstream: URL;
  try {
    upstream = new URL(upstreamRaw);
  } catch {
    return new Response("Invalid LATEX_UPSTREAM_URL", { status: 500, headers: cors() });
  }
  if (upstream.protocol !== "https:") {
    return new Response("LATEX_UPSTREAM_URL must be an https: URL", { status: 500, headers: cors() });
  }

  const tex = await request.text();
  if (tex.length > MAX_BODY_BYTES) {
    return new Response("Request body too large", { status: 413, headers: cors() });
  }

  let r: Response;
  try {
    r = await fetch(upstream.toString(), {
      method: "POST",
      headers: { "Content-Type": "text/plain; charset=utf-8" },
      body: tex,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    return new Response("Upstream compile service unreachable", { status: 502, headers: cors() });
  }

  const buf = await r.arrayBuffer();
  const ct = r.headers.get("Content-Type") || "application/pdf";
  return new Response(buf, {
    status: r.status,
    headers: { ...cors(), "Content-Type": ct },
  });
}
