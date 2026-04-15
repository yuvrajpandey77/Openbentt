import { WORKSPACE_ROUTE_META } from "@/config/workspaceRouteMeta";
import { MAX_CHARS_ASSIST_SNAPSHOT } from "@/lib/pdfText";

/** Base Notebook route system assist (static workflow + LaTeX rules). */
export function getNotebookBaseWorkspaceAssist(): string {
  return WORKSPACE_ROUTE_META["/notebook"]?.systemAssist ?? "";
}

/**
 * Live snapshot for the model: what is in Source, which PDFs exist, active tab, optional proposal snippet.
 * Large source is truncated with a clear note.
 */
export function buildNotebookLiveSnapshot(params: {
  fileName: string | null;
  sourceText: string;
  hasOriginalPdf: boolean;
  hasCompiledPdf: boolean;
  previewVariant: "original" | "compiled";
  mainTab: "preview" | "source";
  hasProposal: boolean;
  proposedLineCount: number;
  isLatexSource: boolean;
}): string {
  const {
    fileName,
    sourceText,
    hasOriginalPdf,
    hasCompiledPdf,
    previewVariant,
    mainTab,
    hasProposal,
    proposedLineCount,
    isLatexSource,
  } = params;

  const src = sourceText ?? "";
  let body = src;
  let truncated = false;
  if (body.length > MAX_CHARS_ASSIST_SNAPSHOT) {
    body = body.slice(0, MAX_CHARS_ASSIST_SNAPSHOT);
    truncated = true;
  }

  const pdfLine = [
    hasOriginalPdf ? "original PDF in workspace" : null,
    hasCompiledPdf ? "compiled PDF available" : null,
  ]
    .filter(Boolean)
    .join("; ");

  const lines = [
    `**Notebook UI (live)**`,
    `- Active tab: **${mainTab}** (${mainTab === "preview" ? "PDF viewer" : "editable Source buffer"}).`,
    `- File name: ${fileName ? `\`${fileName}\`` : "(none)"}.`,
    `- Source kind: ${isLatexSource ? "detected **LaTeX document**" : "plain / PDF extract / fragment"}.`,
    `- PDFs: ${pdfLine || "none loaded yet"}.`,
    hasOriginalPdf && hasCompiledPdf ? `- Preview is showing **${previewVariant}** (Original vs Compiled toggle).` : "",
    hasProposal
      ? `- **Review**: assistant proposal loaded (${proposedLineCount} lines) — user may merge into Source before compile.`
      : `- **Review**: no pending proposal.`,
    "",
    truncated
      ? `**Source text (truncated to ${MAX_CHARS_ASSIST_SNAPSHOT.toLocaleString()} chars in this system prompt; full Source is still in the editor)**`
      : `**Current Source buffer**`,
    "",
    "```",
    body || "(empty)",
    "```",
  ].filter((x) => x !== "");

  return lines.join("\n");
}

export function buildNotebookFullWorkspaceAssist(snapshotParams: Parameters<typeof buildNotebookLiveSnapshot>[0]): string {
  const base = getNotebookBaseWorkspaceAssist();
  const snap = buildNotebookLiveSnapshot(snapshotParams);
  return `${base}\n\n---\n\n${snap}`;
}
