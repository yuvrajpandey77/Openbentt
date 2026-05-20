import { Button } from "@/components/ui/button";
import { useResearchProject } from "@/context/ResearchProjectContext";
import { isDesktopApp } from "@/lib/isDesktopApp";
import { useToast } from "@/components/ui/use-toast";
import { useState } from "react";

export function LibraryModelsPanel() {
  const { project } = useResearchProject();
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);

  const exportCorpus = async () => {
    if (!project || !window.openbenttResearch?.exportFinetuneCorpus) {
      toast({
        title: "Desktop only",
        description: "Fine-tune corpus export requires the Electron app.",
        variant: "destructive",
      });
      return;
    }
    setExporting(true);
    try {
      const res = await window.openbenttResearch.exportFinetuneCorpus(project.id);
      toast({
        title: "Corpus exported",
        description: `${res.count} documents → ${res.path}`,
      });
    } catch (e) {
      toast({
        title: "Export failed",
        description: e instanceof Error ? e.message : "error",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4 rounded-lg border border-border/60 p-4">
      <h2 className="font-semibold">Fine-tune preparation</h2>
      <p className="text-sm text-muted-foreground">
        Export your project papers as JSONL for local Gemma fine-tuning (llama.cpp / HF trainers). Training
        runs outside Openbentt; this step produces a real corpus from your library.
      </p>
      <Button type="button" disabled={!isDesktopApp() || exporting || !project?.papers.length} onClick={exportCorpus}>
        Export finetune corpus (JSONL)
      </Button>
      <p className="text-xs text-muted-foreground">
        GGUF downloads and chat inference are configured below in Local model hub.
      </p>
    </div>
  );
}
