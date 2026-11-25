/**
 * Keeps chat workspace assist tied to the research project across Paper + Editor.
 * NotebookPdfWorkspace owns the rich live snapshot in Editor; this bridge covers
 * Paper mode and fills gaps so floating chat always knows the draft / library.
 */
import { useEffect, useMemo } from "react";
import { useChat } from "@/context/ChatContext";
import { useResearchProject } from "@/context/ResearchProjectContext";
import { useNotebookStudio } from "@/context/NotebookStudioContext";
import {
  buildNotebookFullWorkspaceAssist,
  getNotebookBaseWorkspaceAssist,
} from "@/lib/notebookChatContext";
import { estimateTokensFromText } from "@/lib/contextMeter";
import { MAX_CHARS_ASSIST_SNAPSHOT } from "@/lib/pdfText";
import { buildLatexEditContract, extractBibKeysFromBibliography } from "@/lib/assistantFileEdits";

type StudioSurface = "orchestra" | "editor";

export function NotebookStudioAssistBridge({ surface }: { surface: StudioSurface }) {
  const { project } = useResearchProject();
  const { chatConnections, activeEditorFile } = useNotebookStudio();
  const {
    setWorkspaceRouteAssist,
    setWorkspaceAssistTokenEstimate,
    registerNotebookAssistSync,
  } = useChat();

  const draftSlice = useMemo(() => {
    if (!project) return "";
    const tex = project.draftTex ?? "";
    return tex.length > MAX_CHARS_ASSIST_SNAPSHOT
      ? tex.slice(0, MAX_CHARS_ASSIST_SNAPSHOT)
      : tex;
  }, [project]);

  const buildAssist = useMemo(() => {
    if (!project) return () => getNotebookBaseWorkspaceAssist();

    return () => {
      const texFiles: { label: string; content: string }[] = [];
      const keys =
        chatConnections.texFileKeys.length > 0
          ? chatConnections.texFileKeys
          : surface === "orchestra"
            ? ["draft"]
            : [];

      for (const key of keys) {
        if (key === "draft") {
          texFiles.push({ label: "main.tex", content: project.draftTex ?? "" });
        } else if (key === "bib") {
          texFiles.push({ label: "references.bib", content: project.bibliography ?? "" });
        } else {
          const file = project.projectFiles?.find((f) => f.id === key);
          if (file) texFiles.push({ label: file.path || key, content: file.content ?? "" });
        }
      }

      if (texFiles.length === 0 && draftSlice) {
        texFiles.push({ label: "main.tex", content: draftSlice });
      }

      const paperLines =
        project.papers?.slice(0, 8).map((p, i) => {
          const title = p.metadata?.title ?? p.fileName ?? `paper-${i + 1}`;
          const excerpt = (p.extractedText ?? "").slice(0, 1200);
          return `- ${title}${excerpt ? `\n  ${excerpt}` : ""}`;
        }) ?? [];

      const orchestraNote =
        surface === "orchestra"
          ? [
              "",
              "**Studio surface:** Paper Orchestra (multi-agent manuscript).",
              "User may switch to Editor after Apply — draft/bib below are the live Notebook buffers.",
            ].join("\n")
          : [
              "",
              `**Studio surface:** Editor (active file: ${
                activeEditorFile.type === "bib"
                  ? "references.bib"
                  : activeEditorFile.type === "projectFile"
                    ? activeEditorFile.fileId
                    : "main.tex"
              }).`,
            ].join("\n");

      const citeKeys = extractBibKeysFromBibliography(project.bibliography ?? "");
      const editContract = buildLatexEditContract({
        allowedFiles: [...new Set(["main.tex", "references.bib", ...texFiles.map((f) => f.label)])],
        citeKeys,
        mainTex: "main.tex",
        buildDir: "build",
      });

      return buildNotebookFullWorkspaceAssist(
        {
          fileName: "main.tex",
          sourceText: draftSlice,
          hasOriginalPdf: Boolean(project.papers?.length),
          hasCompiledPdf: false,
          previewVariant: "compiled",
          mainTab: surface === "editor" ? "source" : "preview",
          hasProposal: false,
          proposedLineCount: 0,
          isLatexSource: true,
          connectedTexFiles: texFiles,
          connectedPdfContext:
            paperLines.length > 0
              ? `Library papers attached (${project.papers!.length}):\n${paperLines.join("\n")}`
              : null,
        },
        {
          knowledge: [project.knowledge ?? "", orchestraNote].filter(Boolean).join("\n\n"),
          editContract,
        }
      );
    };
  }, [project, chatConnections.texFileKeys, draftSlice, surface, activeEditorFile]);

  useEffect(() => {
    // Editor PdfWorkspace already registers a richer sync — don't stomp it.
    if (surface === "editor") return;
    const block = buildAssist();
    setWorkspaceRouteAssist(block);
    setWorkspaceAssistTokenEstimate(estimateTokensFromText(block));
    registerNotebookAssistSync(buildAssist);
    return () => {
      registerNotebookAssistSync(null);
      setWorkspaceAssistTokenEstimate(0);
    };
  }, [
    surface,
    buildAssist,
    setWorkspaceRouteAssist,
    setWorkspaceAssistTokenEstimate,
    registerNotebookAssistSync,
  ]);

  return null;
}
