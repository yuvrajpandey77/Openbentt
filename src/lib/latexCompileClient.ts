/**
 * LaTeX → PDF: **defaults to client-side WASM** (BusyTeX via texlyre-busytex).
 * Optional HTTP fallback: same-origin `/api/latex-compile` or `VITE_LATEX_COMPILE_URL`.
 * Electron: `compileProjectLatexDesktop` for full TeX Live on project folder.
 *
 * **Auto (default):** BusyTeX first for simple docs; local pdflatex first when the
 * document needs full TeX Live (IEEE, TikZ, …). Missing pdflatex falls back to WASM.
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

export type CompileEngine = "wasm" | "local" | "http";

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
  "Install TeX Live or MacTeX so pdflatex is on PATH, or set Compile backend to “Browser BusyTeX” in Notebook settings (gear).";

const WASM_LIMIT_HINT =
  "Browser BusyTeX cannot load IEEEtran, TikZ, or many journal packages. Install TeX Live and use “Local TeX Live (Electron)” in Notebook settings.";

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

/**
 * Compile engine order for **auto** mode.
 * - Simple docs: BusyTeX → local pdflatex → HTTP
 * - Full-TeX docs (IEEE, TikZ, …): local pdflatex → BusyTeX → HTTP
 */
export function autoCompileEngineOrder(needsFullTex: boolean, localAvailable: boolean): CompileEngine[] {
  if (needsFullTex && localAvailable) return ["local", "wasm", "http"];
  if (localAvailable) return ["wasm", "local", "http"];
  return ["wasm", "http"];
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

export function isLocalTexUnavailableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /pdflatex not found/i.test(msg);
}

function formatLocalCompileError(message: string, needsFullTex: boolean): Error {
  const brief = briefCompileMessage(message, 900) || message;
  if (/pdflatex not found/i.test(message)) {
    return new Error(`${brief}\n\n${LOCAL_ELECTRON_HINT}`);
  }
  if (needsFullTex) {
    return new Error(`${brief}\n\n${WASM_LIMIT_HINT}`);
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

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function shouldSkipLocalInAuto(err: unknown): boolean {
  return isLocalTexUnavailableError(err);
}

function enrichWasmFailure(wasmMsg: string, needsFullTex: boolean): Error {
  if (needsFullTex) {
    return new Error(`${briefCompileMessage(wasmMsg, 700)}\n\n${WASM_LIMIT_HINT}\n\n${LOCAL_ELECTRON_HINT}`);
  }
  return new Error(wasmMsg);
}

function enrichAutoFailure(
  attempts: { engine: CompileEngine; message: string }[],
  needsFullTex: boolean
): Error {
  const rollup = attempts.map((a) => `${a.engine}: ${briefCompileMessage(a.message, 480)}`).join("\n\n");
  const fileHint = missingBundledFileHint(rollup);
  const extra = needsFullTex ? `\n\n${WASM_LIMIT_HINT}` : "";
  const suffix = fileHint || ASSET_HINT;
  return new Error(`Compile failed (auto):\n\n${rollup}${extra}\n\n${suffix}`);
}

async function runCompileEngine(
  engine: CompileEngine,
  tex: string,
  bundle: CompileBundle | undefined,
  localAvailable: boolean
): Promise<Blob> {
  switch (engine) {
    case "wasm":
      return compileLatexWasmToPdf(tex, bundle);
    case "local":
      if (!localAvailable || !bundle) {
        throw new Error("Local TeX compile requires the Electron app with a project compile bundle.");
      }
      return compileLocalElectron(bundle);
    case "http":
      return compileLatexHttp(tex, getLatexCompileEndpoint(), bundle);
  }
}

async function compileAuto(
  tex: string,
  bundle: CompileBundle | undefined,
  needsFullTex: boolean,
  localAvailable: boolean
): Promise<Blob> {
  const order = autoCompileEngineOrder(needsFullTex, localAvailable);
  const attempts: { engine: CompileEngine; message: string }[] = [];

  for (const engine of order) {
    try {
      return await runCompileEngine(engine, tex, bundle, localAvailable);
    } catch (err) {
      const message = errMessage(err);
      attempts.push({ engine, message });
      if (engine === "local" && shouldSkipLocalInAuto(err)) {
        console.warn("[latex] Local TeX unavailable (no pdflatex), trying next backend…");
        continue;
      }
    }
  }

  throw enrichAutoFailure(attempts, needsFullTex);
}

export async function compileLatexToPdfBlob(tex: string, bundle?: CompileBundle): Promise<Blob> {
  const texClean = sanitizeLatexUnicodeForPdflatex(tex);
  const settings = loadNotebookCompileSettings();
  const forceRemote = import.meta.env.VITE_LATEX_REMOTE === "1";
  const backend: CompileBackend = forceRemote ? "remote" : settings.backend;
  const needsFullTex = documentNeedsFullTexLive(texClean, bundle);
  const localAvailable = canCompileLocalElectron(bundle);

  if (backend === "auto") {
    return compileAuto(texClean, bundle, needsFullTex, localAvailable);
  }

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

  // wasm — explicit BusyTeX only
  try {
    return await compileLatexWasmToPdf(texClean, bundle);
  } catch (wasmErr) {
    throw enrichWasmFailure(errMessage(wasmErr), needsFullTex);
  }
}
