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
  it("prefers BusyTeX for simple docs when local is available", () => {
    expect(autoCompileEngineOrder(false, true)).toEqual(["wasm", "local", "http"]);
  });

  it("prefers local TeX for IEEE-style docs when Electron compile is available", () => {
    expect(autoCompileEngineOrder(true, true)).toEqual(["local", "wasm", "http"]);
  });

  it("uses BusyTeX then HTTP on web without local bundle", () => {
    expect(autoCompileEngineOrder(false, false)).toEqual(["wasm", "http"]);
    expect(autoCompileEngineOrder(true, false)).toEqual(["wasm", "http"]);
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
