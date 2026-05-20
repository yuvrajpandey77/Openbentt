import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RevisionDiffView } from "@/components/research/RevisionDiffView";
import { useResearchProject } from "@/context/ResearchProjectContext";
import { appendRevisionHistory } from "@/lib/research/revisionHistory";
import {
  applyRevisionPatch,
  buildRevisionPatch,
  parseReviewerComments,
} from "@/lib/research/revisionTools";
import type { RevisionSuggestion } from "@/types/researchProject";
import { useMemo, useState } from "react";

export function NotebookReviewPanel() {
  const { project, updateProject, setDraftTex } = useResearchProject();
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");

  const previewSuggestion = useMemo(
    () => project?.revisionSuggestions.find((s) => s.id === previewId) ?? null,
    [project, previewId]
  );

  const patch = useMemo(() => {
    if (!project || !previewSuggestion) return null;
    return buildRevisionPatch(project.draftTex, previewSuggestion);
  }, [project, previewSuggestion]);

  if (!project) return null;

  const ingestComments = (text: string) => {
    const revisionSuggestions = parseReviewerComments(text);
    const revisionHistory = revisionSuggestions.reduce(
      (h, s) => appendRevisionHistory(h, s, "created"),
      project.revisionHistory ?? []
    );
    void updateProject({ revisionSuggestions, revisionHistory });
    if (revisionSuggestions[0]) setPreviewId(revisionSuggestions[0].id);
  };

  const setStatus = (id: string, status: RevisionSuggestion["status"]) => {
    const suggestion = project.revisionSuggestions.find((s) => s.id === id);
    const revisionSuggestions = project.revisionSuggestions.map((s) =>
      s.id === id ? { ...s, status } : s
    );
    const revisionHistory = suggestion
      ? appendRevisionHistory(project.revisionHistory ?? [], suggestion, status === "accepted" ? "accepted" : "rejected")
      : project.revisionHistory;
    void updateProject({ revisionSuggestions, revisionHistory });
    if (previewId === id) setPreviewId(null);
  };

  const accept = (s: RevisionSuggestion) => {
    const draftTex = applyRevisionPatch(project.draftTex, s);
    const revisionSuggestions = project.revisionSuggestions.map((r) =>
      r.id === s.id ? { ...r, status: "accepted" as const } : r
    );
    const revisionHistory = appendRevisionHistory(project.revisionHistory ?? [], s, "accepted");
    void setDraftTex(draftTex);
    void updateProject({ revisionSuggestions, revisionHistory });
    setPreviewId(null);
  };

  const pending = project.revisionSuggestions.filter((s) => s.status === "pending");

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
      <p className="text-xs leading-relaxed text-muted-foreground">
        Paste reviewer comments — each item gets an inline diff before applying to your LaTeX source.
      </p>
      <Textarea
        className="min-h-[88px] text-sm"
        placeholder="1. Clarify contribution in the introduction…"
        value={commentDraft}
        onChange={(e) => setCommentDraft(e.target.value)}
        onBlur={() => {
          if (commentDraft.trim()) ingestComments(commentDraft);
        }}
      />
      {pending.length === 0 && project.revisionSuggestions.length === 0 && (
        <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 px-4 py-8 text-center text-xs text-muted-foreground">
          No revision items yet. Paste numbered reviewer comments above, or load an AI proposal from the editor
          toolbar.
        </div>
      )}
      {previewSuggestion && patch && (
        <RevisionDiffView
          before={patch.before}
          after={patch.after}
          title={previewSuggestion.original.slice(0, 80)}
          onAccept={() => accept(previewSuggestion)}
          onReject={() => setStatus(previewSuggestion.id, "rejected")}
          compact
        />
      )}
      <ul className="space-y-2" role="list">
        {project.revisionSuggestions.map((s) => (
          <li
            key={s.id}
            className="rounded-lg border border-border/60 p-2.5 text-sm focus-within:ring-1 focus-within:ring-ring"
          >
            <button
              type="button"
              className="w-full text-left"
              onClick={() => setPreviewId(s.id)}
              aria-pressed={previewId === s.id}
            >
              <p className="text-foreground line-clamp-3">{s.original.slice(0, 200)}</p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {s.status} · {s.source}
              </p>
            </button>
            {s.status === "pending" && (
              <div className="mt-2 flex gap-2">
                <Button type="button" size="sm" onClick={() => setPreviewId(s.id)}>
                  Preview diff
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setStatus(s.id, "rejected")}>
                  Dismiss
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {(project.revisionHistory?.length ?? 0) > 0 && (
        <div className="border-t border-border/50 pt-3">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Revision history
          </p>
          <ul className="max-h-32 space-y-1 overflow-y-auto text-[10px] text-muted-foreground">
            {project.revisionHistory!.slice(0, 12).map((h) => (
              <li key={h.id}>
                <span className="text-foreground">{h.action}</span> — {h.summary.slice(0, 60)}{" "}
                <time dateTime={h.at}>{new Date(h.at).toLocaleString()}</time>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
