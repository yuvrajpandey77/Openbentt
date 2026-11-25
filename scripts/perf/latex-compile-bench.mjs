#!/usr/bin/env node
/**
 * Bench Notebook-equivalent tectonic compile path (same flags as research:compileProjectLatex).
 * Also exercises electron/latexService.compileLatex and optional BusyTeX presence.
 */
import { spawnSync, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileLatex } from "../../electron/latexService.mjs";

const outPath = path.resolve(process.argv[2] ?? "/tmp/opencode/latex-compile-bench.json");
const report = {
  startedAt: new Date().toISOString(),
  tectonic: null,
  latexService: null,
  busytexAssets: null,
  summary: { ok: false },
};

function msNow() {
  return Date.now();
}

function tectonicVersion() {
  try {
    const r = spawnSync("tectonic", ["--version"], { encoding: "utf8", timeout: 8000 });
    return r.status === 0 ? (r.stdout || r.stderr).trim() : null;
  } catch {
    return null;
  }
}

function compileOnce(dir, texName, label) {
  const t0 = msNow();
  const r = spawnSync(
    "tectonic",
    ["--keep-logs", "--outdir", dir, path.join(dir, texName)],
    { encoding: "utf8", timeout: 180000 }
  );
  const ms = msNow() - t0;
  const pdf = path.join(dir, texName.replace(/\.tex$/i, ".pdf"));
  const st = fs.existsSync(pdf) ? fs.statSync(pdf) : null;
  return {
    label,
    ms,
    status: r.status,
    ok: r.status === 0 && Boolean(st?.size),
    pdfBytes: st?.size ?? 0,
    logTail: `${r.stdout ?? ""}\n${r.stderr ?? ""}`.slice(-800),
  };
}

async function main() {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  report.tectonic = { version: tectonicVersion() };
  if (!report.tectonic.version) {
    report.summary.error = "tectonic not on PATH";
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    process.exit(1);
  }

  const coreBusy = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../public/core/busytex");
  report.busytexAssets = {
    present: fs.existsSync(path.join(coreBusy, "busytex.wasm")),
    dirBytes: (() => {
      try {
        return Number(execFileSync("du", ["-sb", path.dirname(coreBusy)], { encoding: "utf8" }).split(/\s/)[0]);
      } catch {
        return null;
      }
    })(),
  };

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openbentt-latex-bench-"));
  try {
    fs.writeFileSync(
      path.join(dir, "main.tex"),
      String.raw`\documentclass{article}
\begin{document}
Openbentt compile bench.
\section{Math}
$E=mc^2$ and \textbf{bold}.
\end{document}
`
    );
    const cold = compileOnce(dir, "main.tex", "cold-minimal");
    const warm1 = compileOnce(dir, "main.tex", "warm-minimal-1");
    const warm2 = compileOnce(dir, "main.tex", "warm-minimal-2");

    fs.writeFileSync(
      path.join(dir, "refs.bib"),
      `@article{demo,
  author = {Ada Lovelace},
  title = {Notes},
  journal = {Sci},
  year = {1843}
}
`
    );
    fs.writeFileSync(
      path.join(dir, "paper.tex"),
      String.raw`\documentclass{article}
\begin{document}
See \cite{demo}.
\bibliographystyle{plain}
\bibliography{refs}
\end{document}
`
    );
    const bib = compileOnce(dir, "paper.tex", "bib-pass");

    report.tectonic.runs = [cold, warm1, warm2, bib];
    report.tectonic.warmMedianMs = [warm1.ms, warm2.ms].sort((a, b) => a - b)[0];

    const svcDir = fs.mkdtempSync(path.join(os.tmpdir(), "openbentt-latex-svc-"));
    fs.writeFileSync(
      path.join(svcDir, "main.tex"),
      String.raw`\documentclass{article}
\begin{document}
latexService path.
\end{document}
`
    );
    const t0 = msNow();
    const svc = await compileLatex(svcDir, {});
    report.latexService = {
      ms: msNow() - t0,
      ok: svc.ok,
      engine: svc.engine,
      pdfSize: svc.pdfSize,
      errors: svc.errors?.length ?? 0,
    };

    const warmOk = warm1.ok && warm2.ok && warm1.ms < 15000 && warm2.ms < 15000;
    const svcOk = report.latexService.ok && report.latexService.ms < 30000;
    report.summary = {
      ok: cold.ok && bib.ok && warmOk && svcOk,
      warmTargetMs: 15000,
      note:
        "First tectonic run on a machine may download formats (slow). Warm compiles should stay under ~15s for minimal docs.",
    };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!report.summary.ok) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
