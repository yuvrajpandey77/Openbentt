import { Button } from "@/components/ui/button";
import { useResearchProject } from "@/context/ResearchProjectContext";
import { buildTfidfIndex } from "@/lib/research/corpusIndex";
import {
  buildChunkEmbeddings,
  isEmbeddingIndexReady,
  type EmbeddingIndexProgress,
} from "@/lib/research/embeddingIndex";
import { scanDraftHybrid, type RetrievalHit } from "@/lib/research/hybridRetrieval";
import { useMemo, useState } from "react";
import { Loader2, Info } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

function confidenceBadge(c: RetrievalHit["confidence"]) {
  const colors = {
    high: "text-emerald-600 dark:text-emerald-400",
    medium: "text-amber-600 dark:text-amber-400",
    low: "text-muted-foreground",
  };
  return colors[c ?? "low"];
}

export function NotebookSimilarityPanel() {
  const { project, updateProject } = useResearchProject();
  const { toast } = useToast();
  const [scanning, setScanning] = useState(false);
  const [hits, setHits] = useState<RetrievalHit[]>([]);
  const [progress, setProgress] = useState<EmbeddingIndexProgress | null>(null);

  const paperNames = useMemo(() => {
    if (!project) return {};
    return Object.fromEntries(project.papers.map((p) => [p.id, p.metadata.title ?? p.fileName]));
  }, [project]);

  const tfidfIndex = useMemo(() => {
    if (!project) return buildTfidfIndex([]);
    return buildTfidfIndex(project.chunks);
  }, [project]);

  if (!project) return null;

  const indexReady = isEmbeddingIndexReady(project.chunkEmbeddings);

  const runHybrid = async () => {
    setScanning(true);
    setProgress(null);
    try {
      const h = await scanDraftHybrid(
        project.draftTex,
        project.chunks,
        paperNames,
        tfidfIndex,
        indexReady ? project.chunkEmbeddings : undefined
      );
      setHits(h);
    } finally {
      setScanning(false);
    }
  };

  const buildIndex = async () => {
    setScanning(true);
    try {
      const vectors = await buildChunkEmbeddings(project.chunks, setProgress);
      await updateProject({ chunkEmbeddings: vectors });
      toast({
        title: "Semantic index ready",
        description: `${Object.keys(vectors).length} passages embedded with MiniLM (on-device).`,
      });
    } catch (e) {
      toast({
        title: "Embedding index failed",
        description: e instanceof Error ? e.message : "error",
        variant: "destructive",
      });
    } finally {
      setScanning(false);
      setProgress(null);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
      <p className="text-sm text-muted-foreground">
        Hybrid retrieval fuses <strong>lexical TF-IDF</strong> with optional <strong>MiniLM embeddings</strong>,
        then reranks with provenance. All processing stays local.
      </p>

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={runHybrid} disabled={scanning || project.papers.length === 0}>
          {scanning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Hybrid scan
        </Button>
        <Button type="button" variant="secondary" onClick={buildIndex} disabled={scanning || project.papers.length === 0}>
          Build semantic index
        </Button>
      </div>

      {indexReady && (
        <p className="text-xs text-emerald-600 dark:text-emerald-400">
          Semantic index: {Object.keys(project.chunkEmbeddings ?? {}).filter((k) => k !== "__query__").length} chunks
          — hybrid scan uses both signals.
        </p>
      )}

      {!indexReady && project.papers.length > 0 && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Info className="h-3 w-3" />
          Without semantic index, hybrid scan uses lexical TF-IDF only.
        </p>
      )}

      {progress && scanning && (
        <p className="text-xs text-muted-foreground">
          {progress.phase === "loading-model" && "Loading MiniLM model…"}
          {progress.phase === "embedding" && `Embedding ${progress.done}/${progress.total}…`}
        </p>
      )}

      {project.papers.length === 0 && (
        <p className="text-xs text-amber-600 dark:text-amber-400">Add PDFs in Library → Papers first.</p>
      )}

      <ul className="space-y-3">
        {hits.map((h) => (
          <li key={`${h.method}-${h.chunkId}-${h.snippet.slice(0, 24)}`} className="rounded-lg border border-border/60 p-3 text-sm">
            <div className="flex justify-between gap-2">
              <span className="font-medium text-foreground">{h.paperName}</span>
              <span className={`text-xs shrink-0 ${confidenceBadge(h.confidence)}`}>
                {h.confidence ?? "low"} · {(h.score * 100).toFixed(0)}%
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span className="rounded bg-muted px-1.5 py-0.5">{h.method ?? "lexical"}</span>
              {h.lexicalScore != null && h.lexicalScore > 0.05 && (
                <span>TF-IDF {(h.lexicalScore * 100).toFixed(0)}%</span>
              )}
              {h.semanticScore != null && h.semanticScore > 0.35 && (
                <span>MiniLM {(h.semanticScore * 100).toFixed(0)}%</span>
              )}
            </div>
            {h.provenance && (
              <p className="mt-1 text-xs text-muted-foreground italic">Why: {h.provenance}</p>
            )}
            {h.pageHint != null && <span className="text-xs text-muted-foreground">~p.{h.pageHint}</span>}
            <p className="mt-2 text-muted-foreground leading-relaxed">{h.snippet}</p>
          </li>
        ))}
      </ul>

      {hits.length === 0 && !scanning && project.papers.length > 0 && (
        <p className="text-xs text-muted-foreground">Run hybrid scan to see overlap with your library.</p>
      )}
    </div>
  );
}
