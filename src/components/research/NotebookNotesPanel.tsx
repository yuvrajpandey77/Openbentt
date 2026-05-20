import { Textarea } from "@/components/ui/textarea";
import { useResearchProject } from "@/context/ResearchProjectContext";
import { useCallback, useEffect, useState } from "react";

function notesKey(projectId: string) {
  return `openbentt-research-notes-${projectId}`;
}

export function NotebookNotesPanel() {
  const { project } = useResearchProject();
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!project) return;
    try {
      setNotes(localStorage.getItem(notesKey(project.id)) ?? "");
    } catch {
      setNotes("");
    }
  }, [project?.id]);

  const persist = useCallback(
    (value: string) => {
      if (!project) return;
      try {
        localStorage.setItem(notesKey(project.id), value);
      } catch {
        /* ignore */
      }
    },
    [project]
  );

  if (!project) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
      <p className="text-xs text-muted-foreground">Scratchpad for this project — saved locally.</p>
      <Textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={(e) => persist(e.target.value)}
        className="min-h-0 flex-1 resize-none text-sm"
        placeholder="Hypotheses, meeting notes, TODOs…"
        spellCheck
      />
    </div>
  );
}
