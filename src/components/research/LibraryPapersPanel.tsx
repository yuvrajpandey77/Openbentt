import { Button } from "@/components/ui/button";
import { useResearchProject } from "@/context/ResearchProjectContext";
import { displayPaperTitle } from "@/lib/research/displayPaperLabel";
import { VirtualList } from "@/components/VirtualList";
import { LIMITS } from "@/lib/research/projectLimits";
import { FileUp, Trash2 } from "lucide-react";
import { useRef } from "react";

export function LibraryPapersPanel() {
  const { project, uploadPaperPdf, updateProject, projectPressure } = useResearchProject();
  const inputRef = useRef<HTMLInputElement>(null);

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
            if (f) void uploadPaperPdf(f);
            e.target.value = "";
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
      {project.papers.length === 0 ? (
        <p className="text-sm text-muted-foreground">Upload PDFs to build your local corpus.</p>
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
              <Button type="button" size="icon" variant="ghost" onClick={() => removePaper(p.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )}
        />
      )}
    </div>
  );
}
