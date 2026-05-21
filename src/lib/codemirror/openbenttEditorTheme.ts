import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

/** CodeMirror theme aligned with `.app-shell` (Cursor default dark). */
export const openbenttEditorTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "hsl(var(--background))",
      color: "hsl(var(--foreground))",
      height: "100%",
    },
    ".cm-editor": { height: "100%" },
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": {
      overflow: "auto",
      height: "100%",
      fontFamily: "JetBrains Mono, ui-monospace, monospace",
    },
    ".cm-content": {
      caretColor: "hsl(var(--primary))",
      padding: "12px 0",
    },
    ".cm-line": { padding: "0 12px" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "hsl(var(--primary))" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
      backgroundColor: "hsla(204, 100%, 40%, 0.28)",
    },
    ".cm-activeLine": { backgroundColor: "hsl(var(--muted) / 0.35)" },
    ".cm-gutters": { display: "none" },
  },
  { dark: true }
);

/** VS Code Dark+–style token colors for LaTeX / BibTeX. */
export const openbenttHighlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: "#569cd6" },
  { tag: [t.name, t.deleted, t.character, t.macroName], color: "#9cdcfe" },
  { tag: [t.propertyName], color: "#9cdcfe" },
  { tag: [t.processingInstruction, t.string, t.inserted, t.special(t.string)], color: "#ce9178" },
  { tag: [t.function(t.variableName), t.labelName], color: "#dcdcaa" },
  { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: "#4fc1ff" },
  { tag: [t.definition(t.name), t.separator], color: "#d4d4d4" },
  { tag: [t.className], color: "#4ec9b0" },
  { tag: [t.number, t.changed, t.annotation, t.modifier, t.self, t.namespace], color: "#b5cea8" },
  { tag: [t.typeName], color: "#4ec9b0" },
  { tag: [t.operator, t.operatorKeyword], color: "#d4d4d4" },
  { tag: [t.url, t.escape, t.regexp, t.link], color: "#d7ba7d" },
  { tag: t.comment, color: "#6a9955", fontStyle: "italic" },
  { tag: t.meta, color: "#808080" },
  { tag: t.strong, fontWeight: "bold" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: t.heading, color: "#569cd6", fontWeight: "bold" },
  { tag: [t.atom, t.bool], color: "#569cd6" },
]);

export const openbenttSyntaxHighlighting = syntaxHighlighting(openbenttHighlightStyle, { fallback: true });
