export type DocumentClassPreset = "article" | "book" | "ieee";
export type FontPreset = "lmodern" | "times" | "palatino";
export type FontSizePreset = "10pt" | "11pt" | "12pt";
export type LineSpacingPreset = "single" | "1.15" | "1.5" | "double";

export type NotebookDocumentStyle = {
  documentClass: DocumentClassPreset;
  font: FontPreset;
  fontSize: FontSizePreset;
  lineSpacing: LineSpacingPreset;
};

const STORAGE_KEY = "openbentt-notebook-document-style";

export const DEFAULT_DOCUMENT_STYLE: NotebookDocumentStyle = {
  documentClass: "article",
  font: "lmodern",
  fontSize: "11pt",
  lineSpacing: "1.15",
};

export function loadDocumentStyle(): NotebookDocumentStyle {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_DOCUMENT_STYLE };
    return { ...DEFAULT_DOCUMENT_STYLE, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_DOCUMENT_STYLE };
  }
}

export function saveDocumentStyle(next: Partial<NotebookDocumentStyle>): NotebookDocumentStyle {
  const merged = { ...loadDocumentStyle(), ...next };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  return merged;
}

function lineSpacingCommand(sp: LineSpacingPreset): string {
  switch (sp) {
    case "single":
      return "\\setstretch{1.0}";
    case "1.15":
      return "\\setstretch{1.15}";
    case "1.5":
      return "\\setstretch{1.5}";
    case "double":
      return "\\doublespacing";
  }
}

function fontPackages(font: FontPreset): string {
  switch (font) {
    case "times":
      return "\\usepackage{mathptmx}";
    case "palatino":
      return "\\usepackage{mathpazo}";
    default:
      return "\\usepackage{lmodern}";
  }
}

function documentClassLine(preset: DocumentClassPreset, fontSize: FontSizePreset): string {
  if (preset === "ieee") return "\\documentclass[conference]{IEEEtran}";
  if (preset === "book") return `\\documentclass[${fontSize},oneside]{book}`;
  return `\\documentclass[${fontSize},a4paper]{article}`;
}

/**
 * Patch or inject document class / font / spacing into LaTeX source before compile.
 * Skips if user already uses IEEEtran explicitly.
 */
export function applyDocumentStyleToLatex(tex: string, style: NotebookDocumentStyle): string {
  if (/\\documentclass\s*\[?[^\]]*\]?\{IEEEtran\}/.test(tex)) return tex;
  /** User-authored templates (resume, thesis) — do not patch class/font/spacing. */
  if (
    /\\usepackage(\[[^\]]*\])?\{fullpage\}/.test(tex) ||
    /\\usepackage\{titlesec\}/.test(tex) ||
    /\\titleformat\{/.test(tex)
  ) {
    return tex;
  }

  let out = tex;
  const dcLine = documentClassLine(style.documentClass, style.fontSize);

  if (/\\documentclass/.test(out)) {
    out = out.replace(/\\documentclass(\[[^\]]*\])?\{[^}]+\}/, dcLine);
  } else {
    out = `${dcLine}\n${out}`;
  }

  const fontPkg = fontPackages(style.font);
  if (!/\\usepackage\{lmodern\}/.test(out) && !/\\usepackage\{mathptmx\}/.test(out) && !/\\usepackage\{mathpazo\}/.test(out)) {
    if (/\\begin\{document\}/.test(out)) {
      out = out.replace(/\\begin\{document\}/, `${fontPkg}\n\\usepackage{setspace}\n${lineSpacingCommand(style.lineSpacing)}\n\\begin{document}`);
    } else {
      out = `${out}\n${fontPkg}\n\\usepackage{setspace}\n${lineSpacingCommand(style.lineSpacing)}\n`;
    }
  } else if (!/\\setstretch|\\doublespacing/.test(out)) {
    const spacing = `\\usepackage{setspace}\n${lineSpacingCommand(style.lineSpacing)}`;
    if (/\\begin\{document\}/.test(out)) {
      out = out.replace(/\\begin\{document\}/, `${spacing}\n\\begin{document}`);
    }
  }

  return out;
}
