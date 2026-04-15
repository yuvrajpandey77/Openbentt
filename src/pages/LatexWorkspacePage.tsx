import React, { useMemo, useRef, useState } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";

const LatexWorkspacePage: React.FC = () => {
  const { toast } = useToast();
  const previewRef = useRef<HTMLDivElement>(null);
  const [tex, setTex] = useState(String.raw`\int_0^1 x^2\,dx = \frac{1}{3}`);

  const html = useMemo(() => {
    try {
      return katex.renderToString(tex, { displayMode: true, throwOnError: false });
    } catch {
      return "<p>Invalid LaTeX</p>";
    }
  }, [tex]);

  const printPdf = () => {
    window.print();
  };

  const exportRasterPdf = async () => {
    const el = previewRef.current;
    if (!el) return;
    try {
      const canvas = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff", logging: false });
      const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const img = canvas.toDataURL("image/png");
      const imgW = pageW - 40;
      const imgH = (canvas.height * imgW) / canvas.width;
      let y = 20;
      if (imgH + y > pageH - 20) {
        pdf.addImage(img, "PNG", 20, y, imgW, Math.min(imgH, pageH - y - 20));
      } else {
        pdf.addImage(img, "PNG", 20, y, imgW, imgH);
      }
      pdf.save("openbentt-katex.pdf");
      toast({ title: "PDF saved", description: "Raster export from KaTeX preview (not full TeX)." });
    } catch (e) {
      toast({
        title: "Export failed",
        description: e instanceof Error ? e.message : "error",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto print:hidden">
      <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
        <p className="text-sm text-muted-foreground">
          KaTeX preview below — use the main composer for math help; prompts include LaTeX workspace context. Raster PDF is a
          snapshot (no full TeX engine).
        </p>
        <Textarea value={tex} onChange={(e) => setTex(e.target.value)} className="min-h-[160px] font-mono text-sm" />
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={printPdf}>
            Print / Save as PDF (vector via OS)
          </Button>
          <Button type="button" variant="secondary" onClick={() => void exportRasterPdf()}>
            Export PDF (raster snapshot)
          </Button>
        </div>
        <div
          ref={previewRef}
          className="overflow-x-auto rounded-lg border border-border/60 bg-white p-6 py-8 text-black"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
};

export default LatexWorkspacePage;
