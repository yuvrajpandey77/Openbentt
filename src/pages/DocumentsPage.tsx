import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useResearchProject } from "@/context/ResearchProjectContext";
import { Button } from "@/components/ui/button";
import { FileStack, ScanText } from "lucide-react";
import { FilterInput } from "@/components/FilterInput";
import { getDesktopApi } from "@/lib/desktopApi";
import { isDesktopApp } from "@/lib/isDesktopApp";
import { listDocuments } from "@/lib/documents/service";

/**
 * Phase J — Documents view: project artifacts in one place (papers,
 * project files). Same conversation acts on them; no Document Chat.
 */
const DocumentsPage: React.FC = () => {
  const { project } = useResearchProject();
  const [query, setQuery] = useState("");
  const [ocrStatus, setOcrStatus] = useState<"unknown" | "available" | "missing">("unknown");
  const needsOcrCount = project?.id
    ? listDocuments(project.id).filter((d) => d.status === "needs-ocr").length
    : 0;

  useEffect(() => {
    if (!isDesktopApp()) {
      setOcrStatus("missing");
      return;
    }
    const api = getDesktopApi();
    void api?.documentsOcrStatus?.().then((s) => {
      setOcrStatus(s?.available ? "available" : "missing");
    }).catch(() => setOcrStatus("missing"));
  }, []);
  const q = query.trim().toLowerCase();
  const papers = q ? (project?.papers ?? []).filter((p) => p.fileName.toLowerCase().includes(q)) : (project?.papers ?? []);
  const files = q
    ? (project?.projectFiles ?? []).filter((f) => f.path.toLowerCase().includes(q))
    : (project?.projectFiles ?? []);

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-4 py-6">
      <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
        <FileStack className="h-5 w-5 text-primary" /> Documents
      </h1>
      {!project ? (
        <>
          <p className="mt-2 text-sm text-muted-foreground">
            Open a project to see its documents — papers, sources, and artifacts.
          </p>
          <Button asChild size="sm" className="mt-3">
            <Link to="/projects">Open projects</Link>
          </Button>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted-foreground">
            {project.title} — ask in <Link to="/chat" className="underline">chat</Link> to read, convert, or cite these.
          </p>
          {isDesktopApp() && (
            <p
              className="mt-2 flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
              role="status"
            >
              <ScanText className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {ocrStatus === "available"
                ? "Local OCR (Tesseract) is available — scanned PDFs can be read on import."
                : ocrStatus === "missing"
                  ? "Install the system tesseract package to OCR scanned PDFs (otherwise they stay at Needs OCR)."
                  : "Checking local OCR…"}
              {needsOcrCount > 0 && (
                <span className="ml-auto font-medium text-foreground">
                  {needsOcrCount} awaiting OCR
                </span>
              )}
            </p>
          )}
          <div className="mt-3">
            <FilterInput value={query} onChange={setQuery} placeholder="Filter documents…" className="max-w-xs" />
          </div>
          <h2 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Research sources ({papers.length})
          </h2>
          <ul className="mt-2 space-y-1">
            {papers.map((p) => (
              <li key={p.id} className="truncate rounded-lg border border-border/60 bg-card px-3 py-2 text-sm">
                {p.fileName}
              </li>
            ))}
            {papers.length === 0 && (
              <li className="text-xs text-muted-foreground">
                {project.papers.length === 0
                  ? "No sources yet — upload PDFs, DOCX, or Markdown from Research."
                  : `No documents match “${query.trim()}”.`}
              </li>
            )}
          </ul>
          <h2 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Project files ({files.length})
          </h2>
          <ul className="mt-2 space-y-1 pb-10">
            {files.map((f) => (
              <li key={f.id} className="truncate rounded-lg border border-border/60 bg-card px-3 py-2 font-mono text-xs">
                {f.path}
              </li>
            ))}
            {files.length === 0 && (
              <li className="text-xs text-muted-foreground">
                {(project.projectFiles ?? []).length === 0 ? "No project files yet." : `No files match “${query.trim()}”.`}
              </li>
            )}
          </ul>
        </>
      )}
    </div>
  );
};

export default DocumentsPage;
