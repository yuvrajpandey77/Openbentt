/**
 * Full LaTeX → PDF via optional HTTP service (local dev server or deployed compile URL).
 * Browser cannot run pdflatex; set VITE_LATEX_COMPILE_URL or use Vite dev proxy + `npm run latex-compile`.
 */
export function getLatexCompileEndpoint(): string | null {
  const env = import.meta.env.VITE_LATEX_COMPILE_URL as string | undefined;
  if (env != null && String(env).trim() !== "") {
    return String(env).trim().replace(/\/$/, "");
  }
  if (import.meta.env.DEV) return "/api/latex-compile";
  return null;
}

export async function compileLatexToPdfBlob(tex: string): Promise<Blob> {
  const endpoint = getLatexCompileEndpoint();
  if (!endpoint) {
    throw new Error(
      "LaTeX compile is not configured for this build. Set VITE_LATEX_COMPILE_URL to your HTTPS compile endpoint, or run the dev app with `npm run latex-compile` in another terminal (TeX Live / MacTeX must provide `pdflatex`)."
    );
  }
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "text/plain; charset=utf-8" },
    body: tex,
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText.trim().slice(0, 4000) || `Compile failed (HTTP ${res.status})`);
  }
  return res.blob();
}
