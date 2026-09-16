import type { ResearchPanelId } from "@/lib/research/workspaceLayout";
import { NotebookCitationsPanel } from "@/components/research/NotebookCitationsPanel";
import { NotebookSimilarityPanel } from "@/components/research/NotebookSimilarityPanel";
import { NotebookReviewPanel } from "@/components/research/NotebookReviewPanel";
import { NotebookSubmitPanel } from "@/components/research/NotebookSubmitPanel";
import { NotebookZoteroPanel } from "@/components/research/NotebookZoteroPanel";
import { NotebookNotesPanel } from "@/components/research/NotebookNotesPanel";
import { NotebookAssistantPanel } from "@/components/research/NotebookAssistantPanel";
import { LibraryPapersPanel } from "@/components/research/LibraryPapersPanel";
import { KnowledgePanel } from "@/components/research/KnowledgePanel";
import { KnowledgeSearchPanel } from "@/components/knowledge/KnowledgeSearchPanel";
import { ToolPanel } from "@/components/research/ToolPanel";

export function ResearchSidePanel({ id }: { id: ResearchPanelId }) {
  switch (id) {
    case "citations":
      return <NotebookCitationsPanel />;
    case "zotero":
      return <NotebookZoteroPanel />;
    case "assistant":
      return <NotebookAssistantPanel />;
    case "knowledge":
      return <KnowledgePanel />;
    case "graph":
      return <KnowledgeSearchPanel />;
    case "tools":
      return <ToolPanel />;
    case "notes":
      return <NotebookNotesPanel />;
    case "search":
      return <NotebookSimilarityPanel />;
    case "revisions":
      return <NotebookReviewPanel />;
    case "papers":
      return <LibraryPapersPanel />;
    case "submit":
      return <NotebookSubmitPanel />;
    default:
      return null;
  }
}
