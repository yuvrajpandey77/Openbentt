export type CompileBackend = "auto" | "wasm" | "local" | "remote";

export type NotebookCompileSettings = {
  backend: CompileBackend;
  /** Apply document style prefs before compile */
  applyDocumentStyle: boolean;
};

const STORAGE_KEY = "openbentt-notebook-compile-settings";

const DEFAULTS: NotebookCompileSettings = {
  backend: "auto",
  applyDocumentStyle: true,
};

export function loadNotebookCompileSettings(): NotebookCompileSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveNotebookCompileSettings(next: Partial<NotebookCompileSettings>): NotebookCompileSettings {
  const merged = { ...loadNotebookCompileSettings(), ...next };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  return merged;
}

export function compileBackendLabel(b: CompileBackend): string {
  switch (b) {
    case "auto":
      return typeof window !== "undefined" && window.openbenttDesktop?.isElectron
        ? "Auto (local TeX → WASM)"
        : "Auto (WASM → HTTP)";
    case "wasm":
      return "Browser BusyTeX";
    case "local":
      return "Local TeX Live (Electron)";
    case "remote":
      return "Remote HTTP pdflatex";
  }
}
