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
  connectedTexLabel?: string | null;
  connectedTexContent?: string | null;
  connectedTexFiles?: { label: string; content: string }[];
  connectedPdfContext?: string | null;
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
    connectedTexLabel,
    connectedTexContent,
    connectedTexFiles,
    connectedPdfContext,
  } = params;

  const texFiles =
    connectedTexFiles && connectedTexFiles.length > 0
      ? connectedTexFiles
      : connectedTexLabel && connectedTexContent != null
        ? [{ label: connectedTexLabel, content: connectedTexContent }]
        : [];

  const primarySource = texFiles.length > 0 ? texFiles.map((f) => f.content).join("\n\n") : sourceText;
  const src = primarySource ?? "";
  let body = src;
  let truncated = false;
  if (body.length > MAX_CHARS_ASSIST_SNAPSHOT) {
    body = body.slice(0, MAX_CHARS_ASSIST_SNAPSHOT);
    truncated = true;
  }

  const texSummary =
    texFiles.length === 0
      ? ""
      : texFiles.length === 1
        ? `- **Chat connected to LaTeX file:** \`${texFiles[0].label}\` (primary context below).`
        : `- **Chat connected to ${texFiles.length} LaTeX files:** ${texFiles.map((f) => `\`${f.label}\``).join(", ")}.`;

  const sourceHeading =
    texFiles.length === 0
      ? "**Current Source buffer**"
      : texFiles.length === 1
        ? `**Connected LaTeX file (\`${texFiles[0].label}\`)**`
        : "**Connected LaTeX files**";

  const multiFileBody =
    texFiles.length > 1 && !truncated
      ? texFiles
          .map((f) => {
            let chunk = f.content;
            if (chunk.length > Math.floor(MAX_CHARS_ASSIST_SNAPSHOT / texFiles.length)) {
              chunk = chunk.slice(0, Math.floor(MAX_CHARS_ASSIST_SNAPSHOT / texFiles.length));
            }
            return `### ${f.label}\n\`\`\`\n${chunk || "(empty)"}\n\`\`\``;
          })
          .join("\n\n")
      : null;

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
    texSummary,
    connectedPdfContext ? `- **Chat connected to PDF:** ${connectedPdfContext}` : "",
    `- Source kind: ${isLatexSource ? "detected **LaTeX document**" : "plain / PDF extract / fragment"}.`,
    `- PDFs: ${pdfLine || "none loaded yet"}.`,
    hasOriginalPdf && hasCompiledPdf ? `- Preview is showing **${previewVariant}** (Original vs Compiled toggle).` : "",
    hasProposal
      ? `- **Review**: assistant proposal loaded (${proposedLineCount} lines) — user may merge into Source before compile.`
      : `- **Review**: no pending proposal.`,
    "",
    truncated
      ? `**Source text (truncated to ${MAX_CHARS_ASSIST_SNAPSHOT.toLocaleString()} chars in this system prompt; full Source is still in the editor)**`
      : sourceHeading,
    "",
    multiFileBody ?? "```",
    multiFileBody ? "" : body || "(empty)",
    multiFileBody ? "" : "```",
  ].filter((x) => x !== "");

  return lines.join("\n");
}

export function buildNotebookFullWorkspaceAssist(snapshotParams: Parameters<typeof buildNotebookLiveSnapshot>[0]): string {
  const base = getNotebookBaseWorkspaceAssist();
  const snap = buildNotebookLiveSnapshot(snapshotParams);
  return `${base}\n\n---\n\n${snap}`;
}
