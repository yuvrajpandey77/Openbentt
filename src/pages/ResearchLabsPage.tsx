import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { parseBibtex, bibEntriesToContext, type BibEntry } from "@/lib/bibtex";
import { buildCitationGraphFromBib, type CitationGraph } from "@/lib/citationGraph";
import { fetchHfDatasetCard, hfDatasetViewerUrl, type HfDatasetCard } from "@/lib/hfDatasets";
import { useToast } from "@/components/ui/use-toast";
import { Loader2 } from "lucide-react";
import LocalGgufHub from "@/components/LocalGgufHub";
import { isWebClient } from "@/config/platformSurface";

const ResearchLabsPage: React.FC = () => {
  const webClient = isWebClient();
  const { toast } = useToast();
  const [bibRaw, setBibRaw] = useState("");
  const [entries, setEntries] = useState<BibEntry[]>([]);
  const [graph, setGraph] = useState<CitationGraph | null>(null);
  const [loadingGraph, setLoadingGraph] = useState(false);
  const [hfId, setHfId] = useState("squad");
  const [hfCard, setHfCard] = useState<HfDatasetCard | null>(null);
  const [loadingHf, setLoadingHf] = useState(false);
  const webgpu = typeof navigator !== "undefined" && "gpu" in navigator;

  const parseBib = () => {
    const e = parseBibtex(bibRaw);
    setEntries(e);
    setGraph(null);
    toast({ title: `Parsed ${e.length} BibTeX entries` });
  };

  const loadGraph = async () => {
    if (!entries.length) {
      parseBib();
      return;
    }
    setLoadingGraph(true);
    try {
      const g = await buildCitationGraphFromBib(entries);
      setGraph(g);
      toast({ title: "Graph updated", description: `${g.nodes.length} nodes, ${g.edges.length} edges` });
    } catch (e) {
      toast({
        title: "Graph failed",
        description: e instanceof Error ? e.message : "error",
        variant: "destructive",
      });
    } finally {
      setLoadingGraph(false);
    }
  };

  const loadHf = async () => {
    setLoadingHf(true);
    try {
      const c = await fetchHfDatasetCard(hfId.trim());
      setHfCard(c);
      if (!c) toast({ title: "Dataset not found", variant: "destructive" });
    } finally {
      setLoadingHf(false);
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
      <div className="mx-auto max-w-4xl space-y-8">
        <p className="text-sm text-muted-foreground">
          BibTeX, citation graph, and Hugging Face dataset cards — ask in the main composer for help.
        </p>
        {!webClient && <LocalGgufHub />}

        {!webClient && (
        <Card className="space-y-3 p-4">
          <h2 className="font-semibold">WebGPU</h2>
          <p className="text-sm text-muted-foreground">
            Browser WebGPU is {webgpu ? "available" : "not available"} on this device. For heavy in-browser models, use
            Transformers.js in a dedicated build; this app routes LLM calls through OpenRouter or your local OpenAI-compatible
            server.
          </p>
        </Card>
        )}

        <Card className="p-4 space-y-3">
          <h2 className="font-semibold">Zotero / BibTeX import</h2>
          <p className="text-xs text-muted-foreground">Paste exported .bib content. Keys become graph nodes.</p>
          <Textarea
            value={bibRaw}
            onChange={(e) => setBibRaw(e.target.value)}
            className="min-h-[120px] font-mono text-xs"
            placeholder="@article{smith2020, title={...}, ...}"
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={parseBib}>
              Parse BibTeX
            </Button>
            {entries.length > 0 && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => {
                  void navigator.clipboard.writeText(bibEntriesToContext(entries));
                  toast({ title: "Copied", description: "Bibliography summary for pasting into chat." });
                }}
              >
                Copy as chat context
              </Button>
            )}
          </div>
          {entries.length > 0 && (
            <ul className="text-xs space-y-1 max-h-40 overflow-y-auto border border-border/60 rounded p-2">
              {entries.map((e) => (
                <li key={e.key}>
                  <strong>{e.key}</strong>: {e.title || "—"} {e.doi && <span className="text-muted-foreground">doi:{e.doi}</span>}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-4 space-y-3">
          <h2 className="font-semibold">Citation graph (mini)</h2>
          <p className="text-xs text-muted-foreground">
            Sequential edges between library order; Semantic Scholar &quot;cites&quot; edges when DOI is present (limited to a few
            requests).
          </p>
          <Button type="button" size="sm" onClick={() => void loadGraph()} disabled={loadingGraph}>
            {loadingGraph && <Loader2 className="h-4 w-4 mr-2 animate-spin inline" />}
            Build graph
          </Button>
          {graph && (
            <div className="grid md:grid-cols-2 gap-4 text-xs">
              <div>
                <div className="font-medium mb-1">Nodes</div>
                <ul className="space-y-1">
                  {graph.nodes.map((n) => (
                    <li key={n.id} className="truncate">
                      {n.label}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="font-medium mb-1">Edges</div>
                <ul className="space-y-1">
                  {graph.edges.map((e, i) => (
                    <li key={i}>
                      {e.from} → {e.to} {e.label && <span className="text-muted-foreground">({e.label})</span>}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </Card>

        <Card className="p-4 space-y-3">
          <h2 className="font-semibold">Hugging Face dataset card</h2>
          <div className="flex gap-2">
            <Input
              value={hfId}
              onChange={(e) => setHfId(e.target.value)}
              placeholder="e.g. squad, glue, imdb"
              className="font-mono text-sm"
            />
            <Button type="button" size="sm" onClick={() => void loadHf()} disabled={loadingHf}>
              {loadingHf ? <Loader2 className="h-4 w-4 animate-spin" /> : "Load"}
            </Button>
          </div>
          {hfCard && (
            <div className="text-sm space-y-1 border border-border/60 rounded p-3">
              <div className="font-medium">{hfCard.id}</div>
              {hfCard.description && <p className="text-muted-foreground text-xs line-clamp-4">{hfCard.description}</p>}
              <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
                {hfCard.downloaded != null && <span>↓ {hfCard.downloaded}</span>}
                {hfCard.likes != null && <span>♥ {hfCard.likes}</span>}
                {hfCard.gated && <span className="text-amber-600">gated</span>}
              </div>
              {hfCard.tags && hfCard.tags.length > 0 && (
                <p className="text-[11px]">{hfCard.tags.slice(0, 8).join(", ")}</p>
              )}
              <a
                href={hfDatasetViewerUrl(hfCard.id)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary text-xs hover:underline"
              >
                Open dataset viewer →
              </a>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default ResearchLabsPage;
