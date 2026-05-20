import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useZotero } from "@/context/ZoteroContext";
import { useResearchProject } from "@/context/ResearchProjectContext";
import { searchAnnotations, resolveAnnotationSource } from "@/lib/zotero/annotationIndex";
import { recommendCitations } from "@/lib/zotero/zoteroRetrieval";
import { literatureReviewContext, zoteroLiteratureReviewPrompt } from "@/lib/zotero/zoteroPrompts";
import { useChat } from "@/context/ChatContext";
import { ExternalLink, Highlighter, Search } from "lucide-react";

export function ZoteroAnnotationsPanel() {
  const { snapshot, status } = useZotero();
  const { project, updateProject } = useResearchProject();
  const { queuePromptInComposer } = useChat();
  const [query, setQuery] = useState("");
  const [selectedAnn, setSelectedAnn] = useState<string | null>(null);

  const hits = useMemo(() => {
    if (!snapshot || !query.trim()) return [];
    return searchAnnotations(snapshot, query, 15);
  }, [snapshot, query]);

  const recommendations = useMemo(() => {
    if (!snapshot || !project) return [];
    return recommendCitations(snapshot, project.draftTex, { limit: 6 });
  }, [snapshot, project]);

  if (!snapshot) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Connect and sync Zotero to browse annotations and AI retrieval.
      </div>
    );
  }

  const jumpToSource = (annotationKey: string) => {
    const { item, annotation } = resolveAnnotationSource(snapshot, annotationKey);
    if (!item) return;
    setSelectedAnn(annotationKey);
    const cite = `\\cite{${item.citekey}}`;
    const note = `[Zotero p.${annotation?.pageLabel ?? "?"}] ${annotation?.text ?? annotation?.comment ?? ""}`;
    if (project && !project.draftTex.includes(cite)) {
      void updateProject({
        draftTex: project.draftTex.replace(/\\end\{document\}/, `${cite} % ${note}\n\\end{document}`),
      });
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
      <div className="flex items-center gap-2">
        <Highlighter className="h-4 w-4" />
        <h3 className="font-semibold text-sm">Zotero annotations</h3>
        <Badge variant="outline">{snapshot.annotations.length}</Badge>
        <span className="text-xs text-muted-foreground ml-auto">via {status.mode}</span>
      </div>

      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          className="pl-8 h-9 text-sm"
          placeholder="Semantic search over highlights and notes…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {query.trim() ? (
        <ul className="space-y-2">
          {hits.length === 0 && (
            <li className="text-xs text-muted-foreground">No matching annotations.</li>
          )}
          {hits.map((h) => (
            <li
              key={h.annotation.key}
              className={`rounded-lg border p-3 text-sm ${selectedAnn === h.annotation.key ? "border-primary" : "border-border/60"}`}
            >
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{h.itemTitle}</span>
                {h.annotation.pageLabel && <Badge variant="secondary">p.{h.annotation.pageLabel}</Badge>}
                <Badge variant="outline">{h.citekey}</Badge>
                <span className="ml-auto">score {(h.score * 100).toFixed(0)}%</span>
              </div>
              <p className="mt-2 text-foreground">{h.snippet}</p>
              {h.annotation.comment && (
                <p className="mt-1 text-xs text-muted-foreground italic">{h.annotation.comment}</p>
              )}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="mt-2 h-7 text-xs"
                onClick={() => jumpToSource(h.annotation.key)}
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                Insert cite & jump to draft
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="space-y-2">
          {snapshot.annotations.slice(0, 20).map((ann) => {
            const { item } = resolveAnnotationSource(snapshot, ann.key);
            return (
              <li key={ann.key} className="rounded-lg border border-border/60 p-3 text-sm">
                <div className="text-xs text-muted-foreground">
                  {item?.title ?? "Unknown"} · {ann.source}
                  {ann.pageLabel && ` · p.${ann.pageLabel}`}
                </div>
                <p className="mt-1">{ann.text ?? ann.comment ?? "(empty)"}</p>
              </li>
            );
          })}
        </ul>
      )}

      {recommendations.length > 0 && (
        <div className="border-t border-border/60 pt-4 space-y-2">
          <h4 className="text-sm font-semibold">Recommended from Zotero library</h4>
          <ul className="space-y-1 text-sm">
            {recommendations.map((r) => (
              <li key={r.citekey} className="flex flex-wrap items-center gap-2">
                <code className="text-xs">{r.citekey}</code>
                <span className="text-muted-foreground truncate flex-1">{r.title}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => {
                    if (!project) return;
                    const insert = `\\cite{${r.citekey}}`;
                    void updateProject({
                      draftTex: project.draftTex.includes(insert)
                        ? project.draftTex
                        : project.draftTex.replace(/\\end\{document\}/, `${insert}\n\\end{document}`),
                    });
                  }}
                >
                  Insert
                </Button>
              </li>
            ))}
          </ul>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => {
              const ctx = literatureReviewContext(snapshot, { topic: project?.draftTex.slice(0, 500) ?? "" });
              queuePromptInComposer(zoteroLiteratureReviewPrompt("this research topic", ctx));
            }}
          >
            Generate literature review from library
          </Button>
        </div>
      )}
    </div>
  );
}
