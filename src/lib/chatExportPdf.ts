import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

/** Raster PDF export of a DOM subtree (multi-page when content is taller than one page). */
export async function exportElementToPdf(el: HTMLElement, fileBaseName: string): Promise<void> {
  const canvas = await html2canvas(el, {
    scale: 2,
    backgroundColor: "#ffffff",
    logging: false,
    useCORS: true,
  });
  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const marginX = 28;
  const imgW = pageW - marginX * 2;
  const imgH = (canvas.height * imgW) / canvas.width;

  let heightLeft = imgH;
  let position = 0;

  pdf.addImage(imgData, "PNG", marginX, position, imgW, imgH);
  heightLeft -= pageH;

  while (heightLeft >= 0) {
    position = heightLeft - imgH;
    pdf.addPage();
    pdf.addImage(imgData, "PNG", marginX, position, imgW, imgH);
    heightLeft -= pageH;
  }

  const safe = fileBaseName.replace(/[^\w-]+/g, "-").slice(0, 80) || "openbentt-message";
  pdf.save(`${safe}.pdf`);
}
