import { useEffect } from "react";
import { useResearchWorkspace } from "@/context/ResearchWorkspaceContext";
import { useResearchProject } from "@/context/ResearchProjectContext";

/** Global keyboard shortcuts for the research workspace. */
export function useResearchKeyboard() {
  const { openCommandPalette, notebookActions, setActiveSidePanel, undoDraft, redoDraft } =
    useResearchWorkspace();
  const { saveDraftNow, createSnapshot } = useResearchProject();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const target = e.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openCommandPalette();
        return;
      }

      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void (async () => {
          await saveDraftNow();
          await createSnapshot("ctrl-s");
        })();
        return;
      }

      if (mod && e.key === "Enter" && !typing) {
        e.preventDefault();
        void notebookActions.compilePdf?.();
        return;
      }

      if (mod && e.key.toLowerCase() === "p" && !typing) {
        e.preventDefault();
        setActiveSidePanel("papers");
        notebookActions.openPaperPicker?.();
        return;
      }

      if (mod && e.key === "z" && !e.shiftKey && !typing) {
        e.preventDefault();
        const tex = undoDraft();
        if (tex != null) window.dispatchEvent(new CustomEvent("openbentt-draft-undo", { detail: tex }));
        return;
      }

      if ((mod && e.key === "y") || (mod && e.shiftKey && e.key.toLowerCase() === "z")) {
        if (typing) return;
        e.preventDefault();
        const tex = redoDraft();
        if (tex != null) window.dispatchEvent(new CustomEvent("openbentt-draft-redo", { detail: tex }));
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openCommandPalette, notebookActions, setActiveSidePanel, undoDraft, redoDraft, saveDraftNow, createSnapshot]);
}
