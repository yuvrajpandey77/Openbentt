/**
 * Client-side LaTeX → PDF via BusyTeX (texlyre-busytex), no server.
 * Assets: run `npm run download:busytex` (~175MB under public/core/busytex).
 */

import type { CompileBundle } from "@/lib/research/compileBundle";
import { wasmLatexFailureMessage } from "@/lib/latexErrorUi";

let runnerInit: Promise<import("texlyre-busytex").BusyTexRunner> | null = null;

function busyTexBaseUrl(): string {
  const base = import.meta.env.BASE_URL || "/";
  const root = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${root}/core/busytex`;
}

/** Compile full .tex source to PDF in the browser using WebAssembly (pdflatex). */
export async function compileLatexWasmToPdf(tex: string, bundle?: CompileBundle): Promise<Blob> {
  const { BusyTexRunner, PdfLatex } = await import("texlyre-busytex");
  const busytexBasePath = busyTexBaseUrl();

  if (!runnerInit) {
    runnerInit = (async () => {
      const runner = new BusyTexRunner({
        busytexBasePath,
        verbose: false,
      });
      await runner.initialize(true);
      return runner;
    })();
  }

  const runner = await runnerInit;
  const pdfLatex = new PdfLatex(runner, false);

  const mainTex = bundle?.mainTex ?? tex;
  const additionalFiles = bundle?.additionalFiles ?? [];
  const bibtex = bundle?.bibtex ?? false;

  const result = await pdfLatex.compile({
    input: mainTex,
    additionalFiles: additionalFiles.map((f) => ({
      path: f.path,
      content: f.content,
    })),
    bibtex,
    verbose: "silent",
  });

  if (result.success && result.pdf && result.pdf.byteLength > 0) {
    return new Blob([result.pdf], { type: "application/pdf" });
  }

  console.error("[LaTeX WASM] Full pdflatex log:\n", result.log);
  throw new Error(wasmLatexFailureMessage(result.log, result.exitCode));
}

/** For tests or teardown (optional). */
export function terminateLatexWasmRunner(): void {
  if (!runnerInit) return;
  void runnerInit.then((r) => r.terminate()).catch(() => {});
  runnerInit = null;
}
