/**
 * Vercel Edge: forwards POST body (.tex) to LATEX_UPSTREAM_URL (your pdflatex service).
 * Set in Vercel → Environment Variables (not VITE_*): e.g. https://your-latex.railway.app/compile
 *
 * Local dev uses Vite proxy → localhost:8788 instead; this file is unused by `vite dev`.
 */

export const config = { runtime: "edge" };

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

  const upstream = process.env.LATEX_UPSTREAM_URL?.trim();
  if (!upstream) {
    return new Response(
      JSON.stringify({
        message:
          "Set LATEX_UPSTREAM_URL in Vercel to your HTTPS pdflatex endpoint (POST text/plain .tex → application/pdf). Example: deploy server/latex-compile.mjs and paste its public /compile URL.",
      }),
      { status: 503, headers: { "Content-Type": "application/json; charset=utf-8", ...cors() } }
    );
  }

  const tex = await request.text();
  const r = await fetch(upstream, {
    method: "POST",
    headers: { "Content-Type": "text/plain; charset=utf-8" },
    body: tex,
  });

  const buf = await r.arrayBuffer();
  const ct = r.headers.get("Content-Type") || "application/pdf";
  return new Response(buf, {
    status: r.status,
    headers: { ...cors(), "Content-Type": ct },
  });
}
