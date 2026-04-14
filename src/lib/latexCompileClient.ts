/**
 * Full LaTeX → PDF via HTTP: same-origin `/api/latex-compile` (Vite proxy in dev, Vercel Edge proxy in prod),
 * or override with VITE_LATEX_COMPILE_URL (any HTTPS compile URL).
 */
export function getLatexCompileEndpoint(): string {
  const env = import.meta.env.VITE_LATEX_COMPILE_URL as string | undefined;
  if (env != null && String(env).trim() !== "") {
    return String(env).trim().replace(/\/$/, "");
  }
  return "/api/latex-compile";
}

export async function compileLatexToPdfBlob(tex: string): Promise<Blob> {
  const endpoint = getLatexCompileEndpoint();
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
