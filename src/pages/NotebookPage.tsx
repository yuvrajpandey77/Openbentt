import React from "react";
import NotebookPdfWorkspace from "@/components/NotebookPdfWorkspace";

/** Notebook route: PDF reader / source / review — no separate demo cells. */
const NotebookPage: React.FC = () => {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3 md:p-5">
      <div className="mx-auto max-w-5xl">
        <NotebookPdfWorkspace />
      </div>
    </div>
  );
};

export default NotebookPage;
