import { jsPDF } from "jspdf";

/** Matches `--- PDF PAGE 3 / 12 ---` lines produced by layout extraction. */
const PAGE_MARKER = /^--- PDF PAGE \d+ \/ \d+ ---$/;

/**
 * Split Notebook Source into page bodies. Recognizes PDF PAGE markers; otherwise treats whole text as one page.
 */
export function parseNotebookSourceToPages(source: string): string[] {
  const normalized = source.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [""];
  const lines = normalized.split("\n");
  const pages: string[] = [];
  let buf: string[] = [];
  for (const line of lines) {
    if (PAGE_MARKER.test(line.trim())) {
      const chunk = buf.join("\n").trimEnd();
      if (chunk.length) pages.push(chunk);
      buf = [];
    } else {
      buf.push(line);
    }
  }
  const last = buf.join("\n").trimEnd();
  if (last.length) pages.push(last);
  return pages.length ? pages : [normalized];
}

function stripMarkerLinesFromBody(body: string): string {
  return body
    .split("\n")
    .filter((line) => !PAGE_MARKER.test(line.trim()))
    .join("\n");
}

/** Build a multi-page PDF from Notebook Source (honours `--- PDF PAGE i / n ---` blocks when present). */
export function compileTextToPdfBlob(text: string, title = "Notebook export"): Blob {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 44;
  const maxW = pageW - margin * 2;
  const lineH = 14;
  const blankGap = lineH * 0.55;
  const footerReserve = 22;
  const bottomLimit = pageH - margin - footerReserve;

  const pages = parseNotebookSourceToPages(text);
  const totalSourcePages = pages.length;

  const drawFooter = (sourcePageIndex: number) => {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(100);
    doc.text(`Source page ${sourcePageIndex + 1} of ${totalSourcePages}`, pageW / 2, pageH - 12, { align: "center" });
    doc.setTextColor(0);
    doc.setFont("helvetica", "normal");
  };

  const writePage = (pageBody: string, sourcePageIndex: number, isFirstPdfPage: boolean) => {
    let y = margin + (isFirstPdfPage ? 26 : margin);

    if (isFirstPdfPage) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(title, margin, margin + 8);
      doc.setFont("helvetica", "normal");
    }

    doc.setFontSize(10);
    const cleaned = stripMarkerLinesFromBody(pageBody);
    const rawLines = cleaned.split(/\n/);

    const splitLine = (s: string): string[] => doc.splitTextToSize(s, maxW) as string[];

    for (const raw of rawLines) {
      if (!raw.trim()) {
        y += blankGap;
        if (y > bottomLimit) {
          drawFooter(sourcePageIndex);
          doc.addPage();
          y = margin;
          doc.setFont("helvetica", "normal");
          doc.setFontSize(10);
        }
        continue;
      }

      const parts = splitLine(raw);
      for (const line of parts) {
        if (y > bottomLimit) {
          drawFooter(sourcePageIndex);
          doc.addPage();
          y = margin;
          doc.setFont("helvetica", "normal");
          doc.setFontSize(10);
        }
        doc.text(line, margin, y);
        y += lineH;
      }
    }

    drawFooter(sourcePageIndex);
  };

  pages.forEach((body, i) => {
    if (i > 0) doc.addPage();
    writePage(body, i, i === 0);
  });

  return doc.output("blob");
}
