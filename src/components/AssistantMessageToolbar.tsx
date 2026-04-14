import React, { useState } from "react";
import { Copy, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { exportElementToPdf } from "@/lib/chatExportPdf";

interface AssistantMessageToolbarProps {
  exportRef: React.RefObject<HTMLElement | null>;
  plainText: string;
  fileBaseName: string;
  disabled?: boolean;
}

export const AssistantMessageToolbar: React.FC<AssistantMessageToolbarProps> = ({
  exportRef,
  plainText,
  fileBaseName,
  disabled,
}) => {
  const { toast } = useToast();
  const [pdfBusy, setPdfBusy] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(plainText);
      toast({ title: "Copied", description: "Full reply copied to clipboard." });
    } catch (e) {
      toast({
        title: "Copy failed",
        description: e instanceof Error ? e.message : "Clipboard unavailable",
        variant: "destructive",
      });
    }
  };

  const savePdf = async () => {
    const el = exportRef.current;
    if (!el) {
      toast({ title: "Nothing to export", description: "Content not ready.", variant: "destructive" });
      return;
    }
    setPdfBusy(true);
    try {
      await exportElementToPdf(el, fileBaseName);
      toast({ title: "PDF saved", description: "Raster export of the message card (like LaTeX workspace)." });
    } catch (e) {
      toast({
        title: "PDF export failed",
        description: e instanceof Error ? e.message : "error",
        variant: "destructive",
      });
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 gap-1.5"
        disabled={disabled || !plainText.trim()}
        onClick={() => void copy()}
      >
        <Copy className="h-3.5 w-3.5" />
        Copy full
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 gap-1.5"
        disabled={disabled || pdfBusy}
        onClick={() => void savePdf()}
      >
        <FileDown className="h-3.5 w-3.5" />
        {pdfBusy ? "PDF…" : "Download PDF"}
      </Button>
    </div>
  );
};
