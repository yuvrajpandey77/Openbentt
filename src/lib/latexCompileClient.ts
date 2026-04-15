/**
 * LaTeX → PDF: **defaults to client-side WASM** (BusyTeX via texlyre-busytex).
 * Optional HTTP fallback: same-origin `/api/latex-compile` or `VITE_LATEX_COMPILE_URL`.
 *
 * Set `VITE_LATEX_REMOTE=1` to force HTTP-only (no WASM).
 */

import { briefCompileMessage, missingBundledFileHint } from "@/lib/latexErrorUi";
import { compileLatexWasmToPdf } from "@/lib/latexWasmCompile";

export function getLatexCompileEndpoint(): string {
  const env = import.meta.env.VITE_LATEX_COMPILE_URL as string | undefined;
  if (env != null && String(env).trim() !== "") {
    return String(env).trim().replace(/\/$/, "");
  }
  return "/api/latex-compile";
}

const LOCAL_LATEX_DOWN_HINT =
  "Vite proxies /api/latex-compile to 127.0.0.1:8788. Start the helper in another terminal: npm run latex-compile (requires pdflatex on PATH).";

function appendLocalLatexHintIfProxyDown(errText: string, status: number): string {
  const t = errText.trim();
  if (
    status === 502 ||
    status === 503 ||
    status === 504 ||
    /ECONNREFUSED|127\.0\.0\.1:8788|connect\s+ECONNREFUSED|proxy error/i.test(t)
  ) {
    return `${briefCompileMessage(t, 700) || `HTTP ${status}`}\n\n${LOCAL_LATEX_DOWN_HINT}`;
  }
  return briefCompileMessage(t, 900) || `Compile failed (HTTP ${status})`;
}

async function compileLatexHttp(tex: string, endpoint: string): Promise<Blob> {
  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "text/plain; charset=utf-8" },
      body: tex,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/Failed to fetch|NetworkError/i.test(msg) && getLatexCompileEndpoint().startsWith("/")) {
      throw new Error(`${msg}\n\n${LOCAL_LATEX_DOWN_HINT}`);
    }
    throw e;
  }
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(appendLocalLatexHintIfProxyDown(errText, res.status));
  }
  return res.blob();
}

const ASSET_HINT =
  "If the log shows BusyTeX failing to load (not a normal LaTeX error), run: npm run download:busytex (~175MB into public/core).";

export async function compileLatexToPdfBlob(tex: string): Promise<Blob> {
  const forceRemote = import.meta.env.VITE_LATEX_REMOTE === "1";
  if (forceRemote) {
    return compileLatexHttp(tex, getLatexCompileEndpoint());
  }

  try {
    return await compileLatexWasmToPdf(tex);
  } catch (wasmErr) {
    const wasmMsg = wasmErr instanceof Error ? wasmErr.message : String(wasmErr);
    try {
      return await compileLatexHttp(tex, getLatexCompileEndpoint());
    } catch (httpErr) {
      const httpMsg = httpErr instanceof Error ? httpErr.message : String(httpErr);
      console.error("LaTeX WASM compile failed:", wasmErr);
      console.error("LaTeX HTTP fallback failed:", httpErr);
      const wBrief = briefCompileMessage(wasmMsg, 520);
      const hBrief = briefCompileMessage(httpMsg, 520);
      const rollup = `${wasmMsg}\n${httpMsg}`;
      const fileHint = missingBundledFileHint(rollup);
      const sameFile =
        fileHint != null &&
        missingBundledFileHint(wasmMsg) != null &&
        missingBundledFileHint(httpMsg) != null;
      const same =
        wBrief === hBrief ||
        wasmMsg.replace(/\s+/g, " ").trim() === httpMsg.replace(/\s+/g, " ").trim() ||
        sameFile;
      const body = same
        ? `pdflatex failed (browser WASM + HTTP):\n${fileHint ? hBrief : wBrief}`
        : `Client LaTeX (WASM): ${wBrief}\n\nHTTP fallback (${getLatexCompileEndpoint()}): ${hBrief}`;
      const suffix = fileHint ? fileHint : ASSET_HINT;
      throw new Error(`${body}\n\n${suffix}`);
    }
  }
}
