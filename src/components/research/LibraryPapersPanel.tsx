import { Button } from "@/components/ui/button";
import { useResearchProject } from "@/context/ResearchProjectContext";
import { displayPaperTitle } from "@/lib/research/displayPaperLabel";
import { VirtualList } from "@/components/VirtualList";
import { LIMITS } from "@/lib/research/projectLimits";
import { BookOpen, FileUp, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

export function LibraryPapersPanel() {
  const { project, uploadPaperPdf, updateProject, projectPressure } = useResearchProject();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [justAdded, setJustAdded] = useState<{ id: string; title: string } | null>(null);

  const openInNotebook = (paperId: string) => {
    navigate(`/notebook?mode=orchestra&paper=${encodeURIComponent(paperId)}`);
  };

  if (!project) return null;

  const removePaper = (id: string) => {
    const papers = project.papers.filter((p) => p.id !== id);
    void updateProject({ papers, chunks: [] });
  };

  const atLimit = project.papers.length >= LIMITS.maxPapers;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            void uploadPaperPdf(f).then((id) => {
              if (id) setJustAdded({ id, title: f.name });
            });
          }}
        />
        <Button type="button" onClick={() => inputRef.current?.click()} disabled={atLimit}>
          <FileUp className="h-4 w-4 mr-2" />
          Upload PDF
        </Button>
        <span className="text-sm text-muted-foreground">
          {project.papers.length} / {LIMITS.maxPapers} papers
        </span>
        {projectPressure?.level !== "ok" && (
          <span className="text-xs text-primary">Large library — indexing may take longer</span>
        )}
      </div>
      {justAdded && (
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
          <p className="text-sm font-medium text-foreground">Next: open this in Notebook</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {justAdded.title} will show in the notebook sidebar. The chat button wiggles so you can ask about it from there.
          </p>
          <Button type="button" size="sm" className="mt-2" onClick={() => openInNotebook(justAdded.id)}>
            <BookOpen className="mr-2 h-4 w-4" />
            Open in Notebook
          </Button>
        </div>
      )}
      {project.papers.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Upload a PDF. Then open it in Notebook — it lands in the sidebar, and you ask about it from the chat button.
        </p>
      ) : (
        <VirtualList
          items={project.papers}
          estimateSize={88}
          className="min-h-0 flex-1 overflow-y-auto"
          getKey={(p) => p.id}
          renderItem={(p) => (
            <div className="flex items-start justify-between gap-3 rounded-lg border border-border/60 p-3 mb-2">
              <div className="min-w-0">
                <p className="font-medium text-foreground truncate">{displayPaperTitle(p)}</p>
                <p className="text-xs text-muted-foreground">
                  {[p.metadata.authors, p.metadata.year, p.metadata.doi].filter(Boolean).join(" · ")}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {p.extractedText.length.toLocaleString()} chars extracted
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button type="button" size="sm" variant="outline" onClick={() => openInNotebook(p.id)}>
                  <BookOpen className="mr-1.5 h-3.5 w-3.5" />
                  Notebook
                </Button>
                <Button type="button" size="icon" variant="ghost" onClick={() => removePaper(p.id)} aria-label="Remove paper">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        />
      )}
    </div>
  );
}
