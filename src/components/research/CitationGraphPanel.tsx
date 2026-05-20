import { Button } from "@/components/ui/button";
import { useResearchProject } from "@/context/ResearchProjectContext";
import { buildCitationGraphFromBib } from "@/lib/citationGraph";
import { bibEntriesFromGraphNodes } from "@/lib/research/citationGraphSync";
import { parseBibtex } from "@/lib/bibtex";
import type { CitationGraph } from "@/lib/citationGraph";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

/** Project bibliography ↔ Semantic Scholar citation graph. */
export function CitationGraphPanel() {
  const { project, setBibliography } = useResearchProject();
  const { toast } = useToast();
  const [graph, setGraph] = useState<CitationGraph | null>(null);
  const [loading, setLoading] = useState(false);

  if (!project) return null;

  const entries = parseBibtex(project.bibliography);
  const externalNodes = (graph?.nodes ?? []).filter((n) => n.id.startsWith("s2:"));

  const buildGraph = async () => {
    if (entries.length === 0) {
      toast({
        title: "Add BibTeX first",
        description: "Paste entries in the bibliography field, then build the graph.",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    try {
      const g = await buildCitationGraphFromBib(entries);
      setGraph(g);
      toast({
        title: "Citation graph ready",
        description: `${g.nodes.length} nodes · ${g.edges.length} edges (Semantic Scholar when DOI present).`,
      });
    } catch (e) {
      toast({
        title: "Graph build failed",
        description: e instanceof Error ? e.message : "error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const syncToBib = () => {
    if (!graph) return;
    const { bib, entries: added } = bibEntriesFromGraphNodes(graph.nodes, project.bibliography);
    if (added.length === 0) {
      toast({ title: "Nothing new to import", description: "All graph papers are already in your bib." });
      return;
    }
    void setBibliography(bib);
    toast({
      title: "Bibliography synced",
      description: `Added ${added.length} Semantic Scholar reference(s) to project bib.`,
    });
  };

  return (
    <div className="rounded-lg border border-border/60 p-3 space-y-3">
      <p className="text-sm font-semibold text-foreground">Citation graph (Semantic Scholar)</p>
      <p className="text-xs text-muted-foreground">
        Builds a local graph from your project BibTeX. Entries with DOI fetch related papers from Semantic
        Scholar (network required). Import adds missing graph nodes into this project&apos;s bibliography.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={() => void buildGraph()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Build graph from project bib
        </Button>
        {graph && externalNodes.length > 0 && (
          <Button type="button" size="sm" variant="outline" onClick={syncToBib}>
            Import {externalNodes.length} S2 paper(s) into bib
          </Button>
        )}
      </div>
      {graph && (
        <ul className="max-h-40 overflow-y-auto text-xs text-muted-foreground space-y-1">
          {graph.edges.slice(0, 24).map((e, i) => (
            <li key={`${e.from}-${e.to}-${i}`}>
              <span className="font-mono text-foreground">{e.from}</span>
              {" → "}
              <span className="font-mono text-foreground">{e.to}</span>
              {e.label ? ` (${e.label})` : ""}
            </li>
          ))}
          {graph.edges.length > 24 && <li>…{graph.edges.length - 24} more edges</li>}
        </ul>
      )}
    </div>
  );
}
