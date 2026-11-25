import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { compileLatex, detectLatex, parseLatexLog } from "./latexService.mjs";

const GOOD_MAIN = `\\documentclass{article}
\\begin{document}
Hello thesis.
\\end{document}
`;
const BAD_MAIN = `\\documentclass{article}
\\begin{document}
\\undefinedcommandhere
\\end{document}
`;

describe("latexService real execution", () => {
  let dir;
  beforeEach(async () => {
    dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "openbentt-tex-"));
  });
  afterEach(async () => {
    await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
  });

  it("detects main.tex and chapters", async () => {
    await fs.promises.writeFile(path.join(dir, "main.tex"), GOOD_MAIN);
    await fs.promises.writeFile(path.join(dir, "chapter3.tex"), "chapter\n");
    const det = await detectLatex(dir);
    assert.equal(det.isLatex, true);
    assert.equal(det.mainTex, "main.tex");
    assert.ok(det.chapters.includes("chapter3.tex"));
    assert.equal(
      det.engines.tectonic || det.engines.pdflatex || det.engines.latexmk,
      true,
      "expected tectonic, pdflatex, or latexmk on PATH"
    );
  });

  it("compiles a real thesis and verifies the PDF artifact", async () => {
    await fs.promises.writeFile(path.join(dir, "main.tex"), GOOD_MAIN);
    const t0 = Date.now();
    const res = await compileLatex(dir, {});
    const ms = Date.now() - t0;
    assert.equal(res.ok, true);
    assert.equal(res.pdf, "build/main.pdf");
    assert.ok(res.pdfSize > 0);
    assert.equal(res.errors.length, 0);
    assert.ok(ms < 60000, `compile too slow: ${ms}ms`);
    console.log(`latexService compile ok engine=${res.engine} ${ms}ms pdf=${res.pdfSize}B`);
  });

  it("parses real diagnostics on failure (compiler loop input)", async () => {
    await fs.promises.writeFile(path.join(dir, "main.tex"), BAD_MAIN);
    const res = await compileLatex(dir, {});
    assert.equal(res.ok, false);
    // tectonic and pdflatex format errors differently; accept parsed bang/undefined or non-empty failure log
    const hasParsed = res.errors.length > 0 && res.errors.some((e) => /undefined|Emergency|Unknown/i.test(e.message));
    const hasLog = /undefined|error|Emergency/i.test(res.logTail ?? "");
    assert.ok(hasParsed || hasLog, JSON.stringify({ errors: res.errors, logTail: res.logTail?.slice(-400) }));
  });

  it("parseLatexLog handles file:line and bang errors", () => {
    const out = parseLatexLog("./main.tex:127: Undefined control sequence.\n! Emergency stop.\nLaTeX Warning: Citation foo undefined.\n");
    assert.ok(out.errors.some((e) => e.line === 127));
    assert.ok(out.errors.some((e) => /Emergency/.test(e.message)));
    assert.equal(out.warnings.length, 1);
  });
});
