import { StreamLanguage, type StreamParser } from "@codemirror/language";
import { stex } from "@codemirror/legacy-modes/mode/stex";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

export type NotebookEditorLanguage = "latex" | "bib" | "plain";

const latexLanguage = StreamLanguage.define(stex);

const bibParser: StreamParser<unknown> = {
  token(stream) {
    if (stream.eatSpace()) return null;
    if (stream.match(/^@\w+/)) return "keyword";
    if (stream.match(/^[a-zA-Z_][\w-]*(?=\s*=)/)) return "propertyName";
    if (stream.eat("{")) {
      let depth = 1;
      while (!stream.eol() && depth > 0) {
        const ch = stream.next();
        if (ch === "{") depth++;
        else if (ch === "}") depth--;
      }
      return "string";
    }
    if (stream.match(/^"([^"\\]|\\.)*"/)) return "string";
    stream.next();
    return null;
  },
};

const bibLanguage = StreamLanguage.define(bibParser);

export function notebookLanguageExtensions(
  lang: NotebookEditorLanguage,
  opts: { wordWrap: boolean; fontSize: number }
): Extension[] {
  const exts: Extension[] = [
    EditorView.theme({
      ".cm-content": { fontSize: `${opts.fontSize}px`, lineHeight: "1.625" },
      ".cm-scroller": { fontFamily: "JetBrains Mono, ui-monospace, monospace" },
    }),
  ];
  if (lang === "latex") exts.push(latexLanguage);
  else if (lang === "bib") exts.push(bibLanguage);
  if (opts.wordWrap) exts.push(EditorView.lineWrapping);
  return exts;
}

export function resolveNotebookEditorLanguage(
  fileKind: "draft" | "bib" | "projectFile" | "paper",
  filePath?: string
): NotebookEditorLanguage {
  if (fileKind === "bib") return "bib";
  if (fileKind === "paper") return "plain";
  const path = (filePath ?? "").toLowerCase();
  if (path.endsWith(".bib")) return "bib";
  if (path.endsWith(".tex") || path.endsWith(".sty") || path.endsWith(".cls") || path.endsWith(".ltx")) {
    return "latex";
  }
  if (fileKind === "draft" || fileKind === "projectFile") return "latex";
  return "plain";
}
