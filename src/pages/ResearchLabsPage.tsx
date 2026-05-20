import React from "react";
import { LibraryWorkspace } from "@/components/research/LibraryWorkspace";

const ResearchLabsPage: React.FC = () => {
  return (
    <div className="flex min-h-0 flex-1 flex-col px-2 pb-2 pt-1 md:px-3 md:pb-3 md:pt-1.5">
      <LibraryWorkspace />
    </div>
  );
};

export default ResearchLabsPage;
