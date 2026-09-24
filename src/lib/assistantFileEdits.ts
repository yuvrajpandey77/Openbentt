/**
 * Assistant file-edit contract (shared prompt engineering + parser).
 *
 * Problem: chat replies about LaTeX were prose + at best one whole-file
 * ```latex fence; nothing told the model WHICH files it may edit, which
 * \cite keys are valid, or how to express an edit the app can apply.
 * Result: edits never landed, citations were invented.
 *
 * Contract (taught to the model in both the OpenCode project block and the
 * in-chat notebook assist, built by buildLatexEditContract):
 *
 *   ```file-edit
 *   FILE: <workspace-relative path, from the allowed list>
 *   <complete new content of that file>
 *   ```
 *
 * One fence per file. Complete content, never diffs. Parsed by
 * parseAssistantFileEdits; applied only through the approval-gated
 * workspace:write IPC (snapshot-before-write, undo available).
 */
import { parseBibtex } from "@/lib/bibtex";

export interface AssistantFileEdit {
  path: string;
  content: string;
}

export interface EditContractOptions {
  allowedFiles: string[];
  citeKeys: string[];
  mainTex?: string | null;
  buildDir?: string | null;
}

/**
 * The exact instruction text given to the model. Single source of truth —
 * used by the OpenCode PROJECT CONTEXT block and the notebook chat assist
 * so both engines speak the same edit language.
 */
export function buildLatexEditContract(opts: EditContractOptions): string {
  const files = (opts.allowedFiles ?? []).filter(Boolean).slice(0, 30);
  const keys = (opts.citeKeys ?? []).filter(Boolean).slice(0, 150);
  const lines = [
    `[LATEX EDIT CONTRACT — follow exactly when the user asks to change the document]`,
  ];
  if (files.length > 0) {
    lines.push(
      `Editable files (workspace-relative, from this list ONLY — never invent other paths):`,
      files.map((f) => `- ${f}`).join("\n")
    );
  } else {
    lines.push(
      `Editable files: main.tex and references.bib at the workspace root (no other paths).`
    );
  }
  lines.push(
    `To edit, emit ONE fenced block per file, language tag "file-edit", first line "FILE: <path>":`,
    ``,
    `~~~file-edit`,
    `FILE: ${files[0] ?? "main.tex"}`,
    `<complete new content of that file — full file, never a diff or snippet>`,
    `~~~`,
    ``,
    `Rules:`,
    `- Full file content in each block. Never unify-diff, SEARCH/REPLACE, or line numbers.`,
    `- Explain changes in prose OUTSIDE the blocks; the app applies block content verbatim.`,
    `- Do not rename files, do not touch the build directory${opts.buildDir ? ` (${opts.buildDir}/)` : ""}.`,
    opts.mainTex
      ? `- After editing, the app compiles ${opts.mainTex} and verifies the PDF — report what you changed, not build success.`
      : `- After editing, the app compiles and verifies the PDF — report what you changed, not build success.`
  );
  if (keys.length > 0) {
    lines.push(
      `Citation rule: \\cite{} keys must come ONLY from this valid list:`,
      keys.join(", "),
      `If the user needs a reference that is NOT listed, append its full @entry to references.bib in a second file-edit block (FILE: references.bib with the COMPLETE updated .bib), then \\cite{newkey}. Never invent keys, DOIs, or page numbers.`
    );
  } else {
    lines.push(
      `Citation rule: never invent \\cite keys, DOIs, or page numbers. If the user needs a reference, ask for its details (or a PDF) and add the full @entry to references.bib in a file-edit block before citing it.`
    );
  }
  return lines.join("\n");
}

/** Valid \cite keys from a .bib string (bounded, parse-based not regex). */
export function extractBibKeysFromBibliography(bibText: string, max = 150): string[] {
  try {
    const entries = parseBibtex(String(bibText ?? ""));
    const keys: string[] = [];
    for (const e of entries) {
      const k = (e as { key?: unknown }).key;
      if (typeof k === "string" && k.trim()) keys.push(k.trim());
      if (keys.length >= max) break;
    }
    return [...new Set(keys)];
  } catch {
    return [];
  }
}

const FENCE_RE = /```(\w[\w+-]*)\s*\n([\s\S]*?)```/g;

/**
 * Parse machine-readable file edits from an assistant reply. Accepts:
 * - ```file-edit with first line "FILE: <path>"
 * - ```latex|tex|bib whose first non-empty line is "FILE: <path>"
 * Plain ```latex blocks WITHOUT a FILE: line are NOT edits (legacy
 * whole-document draft path stays intact).
 */
export function parseAssistantFileEdits(text: string): AssistantFileEdit[] {
  const out: AssistantFileEdit[] = [];
  if (!text) return out;
  // Tildes variant too (contract shows ~~~ to avoid breaking out of fences).
  const normalized = String(text).replace(/~~~(\w[\w+-]*)\s*\n([\s\S]*?)~~~/g, "```$1\n$2```");
  let m: RegExpExecArray | null;
  FENCE_RE.lastIndex = 0;
  while ((m = FENCE_RE.exec(normalized)) !== null) {
    const lang = (m[1] ?? "").toLowerCase();
    const body = m[2] ?? "";
    const isEditLang = lang === "file-edit" || lang === "fileedit";
    const isTexLang = lang === "latex" || lang === "tex" || lang === "bib" || lang === "bibtex";
    if (!isEditLang && !isTexLang) continue;
    const lines = body.split("\n");
    let fileLine = -1;
    for (let i = 0; i < Math.min(lines.length, 5); i++) {
      if (/^\s*FILE\s*:/i.test(lines[i])) {
        fileLine = i;
        break;
      }
      if (lines[i].trim() !== "" && !isEditLang) break; // tex fence w/o leading FILE: = draft, not edit
      if (lines[i].trim() !== "" && isEditLang) break; // file-edit must start with FILE:
    }
    if (fileLine === -1) continue;
    const rawPath = lines[fileLine].split(/:/).slice(1).join(":").trim();
    if (!rawPath) continue;
    const content = lines
      .slice(fileLine + 1)
      .join("\n")
      .replace(/^\n+/, "")
      .replace(/\s+$/, "");
    if (!content) continue;
    out.push({ path: rawPath, content });
  }
  return out;
}

const EDITABLE_EXTS = new Set([".tex", ".bib"]);

/**
 * Renderer-side pre-check (main re-validates with realpath containment).
 * Returns problems; empty = structurally valid.
 */
export function validateAssistantFileEdits(
  edits: AssistantFileEdit[],
  allowedFiles: string[] | null,
  limits = { maxFiles: 10, maxBytes: 256 * 1024 }
): string[] {
  const problems: string[] = [];
  if (edits.length === 0) problems.push("No file-edit blocks found in this reply.");
  if (edits.length > limits.maxFiles) {
    problems.push(`Too many files (${edits.length} > ${limits.maxFiles}).`);
  }
  const allowed = allowedFiles ? new Set(allowedFiles) : null;
  const seen = new Set<string>();
  for (const e of edits) {
    const p = String(e.path ?? "").replace(/\\/g, "/").trim();
    if (!p || p.startsWith("/") || /(^|\/)\.\.(\/|$)/.test(p) || p.includes("\0")) {
      problems.push(`Blocked path: ${p || "(empty)"} — must be workspace-relative.`);
      continue;
    }
    const ext = p.slice(p.lastIndexOf(".")).toLowerCase();
    if (!EDITABLE_EXTS.has(ext)) {
      problems.push(`Blocked extension: ${p} — only .tex and .bib are editable from chat.`);
      continue;
    }
    if (allowed && !allowed.has(p)) {
      problems.push(`Not in editable list: ${p}.`);
      continue;
    }
    if (seen.has(p)) problems.push(`Duplicate edit for: ${p} (last block wins).`);
    seen.add(p);
    if (e.content.length > limits.maxBytes) {
      problems.push(`${p} exceeds ${Math.round(limits.maxBytes / 1024)}KB.`);
    }
  }
  return problems;
}
