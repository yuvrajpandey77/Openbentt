/**
 * LaTeX → PDF: **defaults to client-side WASM** (BusyTeX via texlyre-busytex).
 * Optional HTTP fallback: same-origin `/api/latex-compile` or `VITE_LATEX_COMPILE_URL`.
 * Electron: `compileProjectLatexDesktop` for full TeX Live on project folder.
 *
 * Set `VITE_LATEX_REMOTE=1` to force HTTP-only (no WASM).
 */

import type { CompileBundle } from "@/lib/research/compileBundle";
import { briefCompileMessage, missingBundledFileHint } from "@/lib/latexErrorUi";
import { sanitizeLatexUnicodeForPdflatex } from "@/lib/latexUnicodeSanitize";
import { compileLatexWasmToPdf } from "@/lib/latexWasmCompile";
import { compileProjectLatexDesktop, hasResearchDesktopApi } from "@/lib/research/researchDesktopApi";
import { arrayBufferToBase64 } from "@/lib/research/base64";
import { loadNotebookCompileSettings, type CompileBackend } from "@/lib/notebookCompileSettings";
import { isDesktopApp } from "@/lib/isDesktopApp";

export function getLatexCompileEndpoint(): string {
  const env = import.meta.env.VITE_LATEX_COMPILE_URL as string | undefined;
  if (env != null && String(env).trim() !== "") {
    return String(env).trim().replace(/\/$/, "");
  }
  return "/api/latex-compile";
}

const LOCAL_LATEX_DOWN_HINT =
  "Vite proxies /api/latex-compile to 127.0.0.1:8788. Start the helper in another terminal: npm run latex-compile (requires pdflatex on PATH).";

const LOCAL_ELECTRON_HINT =
  "In Notebook settings (gear), set Compile backend to “Local TeX Live (Electron)”. Install TeX Live or MacTeX so pdflatex is on PATH.";

const WASM_LIMIT_HINT =
  "Browser BusyTeX cannot load IEEEtran, TikZ, or many journal packages. Use Local TeX Live (Electron) or install pdflatex on your machine.";

const FULL_TEX_SIGNALS: RegExp[] = [
  /\\documentclass\s*(\[[^\]]*\])?\{IEEEtran\}/i,
  /\\usepackage\{[^}]*\btikz/i,
  /\\usepackage\{algorithmic\}/i,
  /\\usepackage\{algorithm2e\}/i,
  /\\usepackage\{caption\}/i,
  /\\usepackage\{subcaption\}/i,
  /\\usepackage\{cleveref\}/i,
  /\\usepackage(\[[^\]]*\])?\{babel\}/i,
  /\\usepackage\{polyglossia\}/i,
  /\\usepackage(\[[^\]]*\])?\{fullpage\}/i,
  /\\usepackage\{titlesec\}/i,
  /\\usepackage\{enumitem\}/i,
  /\\usepackage\{fancyhdr\}/i,
  /\\usepackage\{marvosym\}/i,
  /\\input\{glyphtounicode\}/i,
  /\\titleformat\{/i,
];

/** True when the document needs a full TeX installation (not BusyTeX WASM). */
export function documentNeedsFullTexLive(tex: string, bundle?: CompileBundle): boolean {
  const chunks = [tex];
  if (bundle) {
    chunks.push(bundle.mainTex);
    for (const f of bundle.additionalFiles) {
      if (typeof f.content === "string" && /\.tex$/i.test(f.path)) chunks.push(f.content);
    }
  }
  const combined = chunks.join("\n");
  return FULL_TEX_SIGNALS.some((re) => re.test(combined));
}

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

type HttpCompilePayload = {
  mainTex: string;
  mainPath: string;
  files: { path: string; content: string; encoding?: "utf8" | "base64" }[];
  bibtex: boolean;
};

async function compileLatexHttp(tex: string, endpoint: string, bundle?: CompileBundle): Promise<Blob> {
  let body: string;
  let contentType: string;
  if (bundle) {
    const payload: HttpCompilePayload = {
      mainTex: bundle.mainTex,
      mainPath: bundle.mainPath,
      bibtex: bundle.bibtex,
      files: bundle.additionalFiles.map((f) => {
        if (typeof f.content === "string") {
          return { path: f.path, content: f.content, encoding: "utf8" as const };
        }
        const buf = f.content.buffer.slice(
          f.content.byteOffset,
          f.content.byteOffset + f.content.byteLength
        );
        const b64 = arrayBufferToBase64(buf);
        return { path: f.path, content: b64, encoding: "base64" as const };
      }),
    };
    body = JSON.stringify(payload);
    contentType = "application/json; charset=utf-8";
  } else {
    body = tex;
    contentType = "text/plain; charset=utf-8";
  }

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": contentType },
      body,
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

function canCompileLocalElectron(bundle?: CompileBundle): bundle is CompileBundle {
  return Boolean(bundle && isDesktopApp() && hasResearchDesktopApi());
}

function formatLocalCompileError(message: string, needsFullTex: boolean): Error {
  const brief = briefCompileMessage(message, 900) || message;
  if (/pdflatex not found/i.test(message)) {
    return new Error(`${brief}\n\n${LOCAL_ELECTRON_HINT}`);
  }
  if (needsFullTex) {
    return new Error(`${brief}\n\n${WASM_LIMIT_HINT}\n\n${LOCAL_ELECTRON_HINT}`);
  }
  return new Error(brief);
}

async function compileLocalElectron(bundle: CompileBundle): Promise<Blob> {
  const r = await compileProjectLatexDesktop(bundle);
  if (!r?.ok || !r.base64) {
    const msg = r?.message ?? "Local TeX compile failed";
    throw formatLocalCompileError(msg, documentNeedsFullTexLive(bundle.mainTex, bundle));
  }
  const binary = atob(r.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: "application/pdf" });
}

function resolveBackend(
  requested: CompileBackend,
  tex: string,
  bundle?: CompileBundle
): CompileBackend {
  if (requested === "wasm" || requested === "remote") return requested;
  if (requested === "local") return "local";
  if (canCompileLocalElectron(bundle)) return "local";
  if (isDesktopApp() && hasResearchDesktopApi() && documentNeedsFullTexLive(tex, bundle)) {
    return "local";
  }
  return "wasm";
}

export async function compileLatexToPdfBlob(tex: string, bundle?: CompileBundle): Promise<Blob> {
  const texClean = sanitizeLatexUnicodeForPdflatex(tex);
  const settings = loadNotebookCompileSettings();
  const forceRemote = import.meta.env.VITE_LATEX_REMOTE === "1";
  const backend = forceRemote ? "remote" : resolveBackend(settings.backend, texClean, bundle);
  const needsFullTex = documentNeedsFullTexLive(texClean, bundle);
  const localAvailable = canCompileLocalElectron(bundle);

  if (backend === "remote") {
    return compileLatexHttp(texClean, getLatexCompileEndpoint(), bundle);
  }

  if (backend === "local") {
    if (!localAvailable) {
      throw new Error(
        needsFullTex
          ? `${WASM_LIMIT_HINT}\n\n${LOCAL_ELECTRON_HINT}`
          : "Local TeX compile requires the Electron app with a project compile bundle."
      );
    }
    return compileLocalElectron(bundle);
  }

  if (localAvailable && (settings.backend === "auto" || needsFullTex)) {
    try {
      return await compileLocalElectron(bundle);
    } catch (localErr) {
      if (settings.backend === "auto" && !needsFullTex) {
        console.warn("Local TeX compile failed, falling back to WASM:", localErr);
      } else {
        throw localErr;
      }
    }
  }

  try {
    return await compileLatexWasmToPdf(texClean, bundle);
  } catch (wasmErr) {
    const wasmMsg = wasmErr instanceof Error ? wasmErr.message : String(wasmErr);

    if (backend === "wasm") {
      if (needsFullTex) {
        throw new Error(`${briefCompileMessage(wasmMsg, 700)}\n\n${WASM_LIMIT_HINT}\n\n${LOCAL_ELECTRON_HINT}`);
      }
      throw wasmErr;
    }

    try {
      if (localAvailable) {
        return await compileLocalElectron(bundle);
      }
      return await compileLatexHttp(texClean, getLatexCompileEndpoint(), bundle);
    } catch (fallbackErr) {
      const httpMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
      console.error("LaTeX WASM compile failed:", wasmErr);
      console.error("LaTeX fallback failed:", fallbackErr);
      const wBrief = briefCompileMessage(wasmMsg, 520);
      const hBrief = briefCompileMessage(httpMsg, 520);
      const rollup = `${wasmMsg}\n${httpMsg}`;
      const fileHint = missingBundledFileHint(rollup);
      const extra = needsFullTex ? `\n\n${WASM_LIMIT_HINT}` : "";
      const body = `Client LaTeX (WASM): ${wBrief}\n\nFallback: ${hBrief}${extra}`;
      const suffix = fileHint ? fileHint : ASSET_HINT;
      throw new Error(`${body}\n\n${suffix}`);
    }
  }
}
