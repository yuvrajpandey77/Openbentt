import { Button } from "@/components/ui/button";
import { useResearchProject } from "@/context/ResearchProjectContext";
import { buildCrossPaperSynthesis } from "@/lib/research/synthesis";
import { memoryGraphSummary } from "@/lib/research/researchMemory";
import { downloadTextFile } from "@/lib/chatExportMarkdown";
import { useState } from "react";

export function LibrarySynthesisPanel() {
  const { project } = useResearchProject();
  const [report, setReport] = useState<ReturnType<typeof buildCrossPaperSynthesis> | null>(null);

  if (!project) return null;

  const memorySummary = project.researchMemory ? memoryGraphSummary(project.researchMemory) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
      <p className="text-sm text-muted-foreground">
        Theme analysis (lexical): TF-IDF topics, paper clustering, claim extraction, contradiction hints,
        methodology comparison, research gaps, and timeline — computed locally (no LLM synthesis).
      </p>

      {memorySummary && (
        <p className="text-xs text-muted-foreground">
          Research memory: {memorySummary.entityCount} entities, {memorySummary.edgeCount} edges (
          {memorySummary.paperCount} papers, {memorySummary.citationCount} citations, {memorySummary.termCount}{" "}
          terms)
        </p>
      )}

      <Button
        type="button"
        onClick={() =>
          setReport(buildCrossPaperSynthesis(project.papers, project.draftTex, project.bibEntries))
        }
      >
        Run theme synthesis (lexical)
      </Button>
      {report && (
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => downloadTextFile("synthesis.md", report.markdown)}
          >
            Download report
          </Button>
          {report.claims.length > 0 && (
            <div className="rounded-lg border border-border/60 p-3 text-xs">
              <p className="font-semibold mb-2">Sample claims (pattern-extracted)</p>
              {report.claims.slice(0, 3).map((c, i) => (
                <p key={i} className="text-muted-foreground mb-1">
                  <span className="text-foreground">{c.paperTitle}</span> ({c.confidence}):{" "}
                  {c.sentence.slice(0, 120)}…
                </p>
              ))}
            </div>
          )}
          <pre className="whitespace-pre-wrap rounded-lg border border-border/60 bg-muted/30 p-4 text-xs">
            {report.markdown}
          </pre>
        </>
      )}
    </div>
  );
}
