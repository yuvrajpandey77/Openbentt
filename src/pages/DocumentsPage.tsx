import React from "react";
import { Link } from "react-router-dom";
import { useResearchProject } from "@/context/ResearchProjectContext";
import { Button } from "@/components/ui/button";
import { FileStack } from "lucide-react";

/**
 * Phase J — Documents view: project artifacts in one place (papers,
 * project files). Same conversation acts on them; no Document Chat.
 */
const DocumentsPage: React.FC = () => {
  const { project } = useResearchProject();

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
          <h2 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Research sources ({project.papers.length})
          </h2>
          <ul className="mt-2 space-y-1">
            {project.papers.map((p) => (
              <li key={p.id} className="truncate rounded-lg border border-border/60 bg-card px-3 py-2 text-sm">
                {p.fileName}
              </li>
            ))}
            {project.papers.length === 0 && (
              <li className="text-xs text-muted-foreground">No sources yet — upload PDFs, DOCX, or Markdown from Research.</li>
            )}
          </ul>
          <h2 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Project files ({project.projectFiles?.length ?? 0})
          </h2>
          <ul className="mt-2 space-y-1 pb-10">
            {(project.projectFiles ?? []).map((f) => (
              <li key={f.id} className="truncate rounded-lg border border-border/60 bg-card px-3 py-2 font-mono text-xs">
                {f.path}
              </li>
            ))}
            {(project.projectFiles ?? []).length === 0 && (
              <li className="text-xs text-muted-foreground">No project files yet.</li>
            )}
          </ul>
        </>
      )}
    </div>
  );
};

export default DocumentsPage;
