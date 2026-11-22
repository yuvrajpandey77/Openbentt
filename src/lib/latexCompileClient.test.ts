import { describe, expect, it } from "vitest";
import {
  autoCompileEngineOrder,
  documentNeedsFullTexLive,
  isLocalTexUnavailableError,
} from "./latexCompileClient";

describe("documentNeedsFullTexLive", () => {
  it("detects IEEEtran", () => {
    expect(documentNeedsFullTexLive("\\documentclass[conference]{IEEEtran}")).toBe(true);
  });

  it("detects TikZ", () => {
    expect(documentNeedsFullTexLive("\\usepackage{tikz}")).toBe(true);
  });

  it("returns false for minimal article", () => {
    expect(documentNeedsFullTexLive("\\documentclass{article}\\begin{document}Hi\\end{document}")).toBe(
      false
    );
  });
});

describe("autoCompileEngineOrder", () => {
  it("prefers native TeX whenever Electron compile is available", () => {
    expect(autoCompileEngineOrder(false, true)).toEqual(["local", "wasm"]);
    expect(autoCompileEngineOrder(true, true)).toEqual(["local", "wasm"]);
  });

  it("uses BusyTeX only when no local engine is available", () => {
    expect(autoCompileEngineOrder(false, false)).toEqual(["wasm"]);
    expect(autoCompileEngineOrder(true, false)).toEqual(["wasm"]);
  });
});

describe("isLocalTexUnavailableError", () => {
  it("recognizes missing pdflatex", () => {
    expect(isLocalTexUnavailableError(new Error("pdflatex not found on PATH"))).toBe(true);
  });

  it("returns false for other errors", () => {
    expect(isLocalTexUnavailableError(new Error("LaTeX Error: undefined control sequence"))).toBe(false);
  });
});
