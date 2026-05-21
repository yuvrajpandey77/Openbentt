import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useResearchWorkspace } from "@/context/ResearchWorkspaceContext";
import { parseResearchPanelFromSearch } from "@/config/researchPanelNav";

/** Sync `?panel=` query param → right-side research tool drawer. */
export function NotebookUrlPanelSync() {
  const [searchParams] = useSearchParams();
  const { openResearchToolPanel } = useResearchWorkspace();

  useEffect(() => {
    const panel = parseResearchPanelFromSearch(searchParams.toString());
    if (panel) openResearchToolPanel(panel);
  }, [searchParams, openResearchToolPanel]);

  return null;
}
