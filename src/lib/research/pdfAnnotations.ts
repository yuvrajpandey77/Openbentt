import type { PdfAnnotation, PdfAnnotationKind } from "@/types/researchProject";

export const DEFAULT_HIGHLIGHT_COLOR = "rgba(250, 204, 21, 0.35)";

export function createPdfAnnotation(
  page: number,
  rect: PdfAnnotation["rect"],
  kind: PdfAnnotationKind = "highlight",
  text?: string
): PdfAnnotation {
  return {
    id: crypto.randomUUID?.() ?? `ann-${Date.now()}`,
    page,
    rect: {
      x: Math.max(0, Math.min(1, rect.x)),
      y: Math.max(0, Math.min(1, rect.y)),
      w: Math.max(0.01, Math.min(1, rect.w)),
      h: Math.max(0.01, Math.min(1, rect.h)),
    },
    kind,
    color: kind === "highlight" ? DEFAULT_HIGHLIGHT_COLOR : undefined,
    text,
    createdAt: new Date().toISOString(),
  };
}

export function annotationsForPage(annotations: PdfAnnotation[] | undefined, page: number): PdfAnnotation[] {
  if (!annotations?.length) return [];
  return annotations.filter((a) => a.page === page);
}
