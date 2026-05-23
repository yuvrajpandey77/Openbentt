import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useResearchProject } from "@/context/ResearchProjectContext";
import { useQueueResearchPrompt } from "@/hooks/useQueueResearchPrompt";
import {
  appendBibEntry,
  bibEntryFromMetadata,
  bibliographyHealthReport,
  completeMetadataFromDoi,
  formatCitation,
  lintCitations,
  suggestRelatedKeys,
  validateDoiEntries,
} from "@/lib/research/citationTools";
import { bibEntryFromCrossref, lookupDoi } from "@/lib/research/crossrefClient";
import { parseBibtex } from "@/lib/bibtex";
import type { CitationStyle } from "@/types/researchProject";
import { useMemo, useState } from "react";
import { missingCitationPrompt } from "@/lib/research/writingPrompts";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { CitationGraphPanel } from "@/components/research/CitationGraphPanel";

export function NotebookCitationsPanel() {
  const { project, setBibliography, updateProject } = useResearchProject();
  const { queueResearchPrompt } = useQueueResearchPrompt();
  const { toast } = useToast();
  const [style, setStyle] = useState<CitationStyle>("apa");
  const [doiInput, setDoiInput] = useState("");
  const [busy, setBusy] = useState(false);

  const issues = useMemo(
    () => (project ? lintCitations(project.draftTex, project.bibliography) : []),
    [project]
  );

  const health = useMemo(
    () => (project ? bibliographyHealthReport(project.bibliography) : null),
    [project]
  );

  const suggestions = useMemo(() => {
    if (!project) return [];
    return suggestRelatedKeys(
      project.draftTex,
      project.bibEntries,
      project.papers.map((p) => p.metadata.title ?? p.fileName)
    );
  }, [project]);

  if (!project) return null;

  const addCiteToDraft = (key: string) => {
    const insert = `\\cite{${key}}`;
    const tex = project.draftTex.includes(insert)
      ? project.draftTex
      : project.draftTex.replace(/\\end\{document\}/, `${insert}\n\\end{document}`);
    void updateProject({ draftTex: tex });
  };

  const lookupAndAddDoi = async () => {
    if (!doiInput.trim()) return;
    setBusy(true);
    try {
      const result = await lookupDoi(doiInput.trim());
      if (!result.found || !result.work) {
        toast({ title: "DOI lookup failed", description: result.error, variant: "destructive" });
        return;
      }
      const key = `ref${project.bibEntries.length + 1}`;
      const entry = bibEntryFromCrossref(key, result.work);
      await setBibliography(appendBibEntry(project.bibliography, entry));
      toast({ title: "Added from Crossref", description: result.work.title ?? result.doi });
      setDoiInput("");
    } finally {
      setBusy(false);
    }
  };

  const enrichDois = async () => {
    setBusy(true);
    try {
      let bib = project.bibliography;
      for (const e of project.bibEntries.filter((x) => x.doi).slice(0, 8)) {
        const { entry, error } = await completeMetadataFromDoi(e);
        if (!error && entry.raw !== e.raw) {
          bib = bib.replace(e.raw, entry.raw);
        }
      }
      await setBibliography(bib);
      const doiIssues = await validateDoiEntries(project.bibEntries);
      if (doiIssues.length) {
        toast({ title: "DOI validation", description: `${doiIssues.length} issue(s) found.` });
      } else {
        toast({ title: "Bibliography enriched", description: "Crossref metadata merged where available." });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={style} onValueChange={(v) => setStyle(v as CitationStyle)}>
          <SelectTrigger className="h-9 w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="apa">APA (CSL)</SelectItem>
            <SelectItem value="ieee">IEEE (CSL)</SelectItem>
            <SelectItem value="mla">MLA (CSL)</SelectItem>
            <SelectItem value="chicago">Chicago (CSL)</SelectItem>
            <SelectItem value="acm">ACM (CSL)</SelectItem>
            <SelectItem value="nature">Nature (CSL)</SelectItem>
            <SelectItem value="bibtex">BibTeX raw</SelectItem>
          </SelectContent>
        </Select>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => {
            const last = project.papers[project.papers.length - 1];
            if (!last) return;
            const entry = bibEntryFromMetadata(`paper${project.papers.length}`, last.metadata);
            void setBibliography(appendBibEntry(project.bibliography, entry));
          }}
        >
          BibTeX from last PDF
        </Button>
        <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={enrichDois}>
          {busy ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
          Enrich via Crossref
        </Button>
      </div>

      <div className="flex gap-2">
        <input
          className="flex h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm"
          placeholder="DOI lookup (e.g. 10.1038/nature12373)"
          value={doiInput}
          onChange={(e) => setDoiInput(e.target.value)}
        />
        <Button type="button" size="sm" disabled={busy || !doiInput.trim()} onClick={lookupAndAddDoi}>
          Add DOI
        </Button>
      </div>

      {health && health.entryCount > 0 && (
        <div className="rounded-lg border border-border/60 p-3 text-sm">
          <p className="font-semibold">
            Bibliography health — {(health.completenessScore * 100).toFixed(0)}% complete
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {health.entryCount} entries · {health.missingFieldCount} missing fields ·{" "}
            {health.duplicateKeys.length + health.duplicateDois.length} duplicates
          </p>
        </div>
      )}

      <CitationGraphPanel />

      <Textarea
        className="min-h-[140px] font-mono text-xs"
        value={project.bibliography}
        onChange={(e) => void setBibliography(e.target.value)}
        placeholder="@article{...}"
      />

      {issues.length > 0 && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
          <p className="font-semibold text-foreground">Citation lint</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
            {issues.map((i) => (
              <li key={`${i.kind}-${i.key ?? i.message}`}>{i.message}</li>
            ))}
          </ul>
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="rounded-lg border border-border/60 p-3">
          <p className="text-sm font-semibold">Suggested citations</p>
          <div className="mt-2 flex flex-col gap-2">
            {suggestions.map((s) => (
              <div key={s.key} className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" variant="secondary" onClick={() => addCiteToDraft(s.key)}>
                  {`Insert \\cite{${s.key}}`}
                </Button>
                <span className="text-xs text-muted-foreground">
                  {s.confidence} — {s.reason}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-sm font-semibold">Formatted preview (CSL/citeproc)</p>
        {parseBibtex(project.bibliography)
          .slice(0, 6)
          .map((e) => (
            <p key={e.key} className="text-xs text-muted-foreground border-l-2 border-primary/30 pl-2">
              {formatCitation(e, style)}
            </p>
          ))}
      </div>

      {issues.some((i) => i.kind === "missing_bib" && i.key) && (
        <Button
          type="button"
          size="sm"
          onClick={() => {
            const key = issues.find((i) => i.kind === "missing_bib")?.key ?? "";
            void queueResearchPrompt(
              missingCitationPrompt(key, project.draftTex),
              "citations",
              project.draftTex
            );
          }}
        >
          Ask chat about missing citation
        </Button>
      )}
    </div>
  );
}
