import { ZoteroConnectionPanel } from "@/components/research/ZoteroConnectionPanel";
import { ZoteroAnnotationsPanel } from "@/components/research/ZoteroAnnotationsPanel";

/** Zotero rail — connection, sync, annotations, and AI retrieval. */
export function NotebookZoteroPanel() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
      <ZoteroConnectionPanel />
      <ZoteroAnnotationsPanel />
    </div>
  );
}
