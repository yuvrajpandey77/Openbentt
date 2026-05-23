import { describe, expect, it } from "vitest";
import { annotationsForPage, createPdfAnnotation } from "@/lib/research/pdfAnnotations";

describe("pdfAnnotations", () => {
  it("creates normalized highlight rects", () => {
    const ann = createPdfAnnotation(2, { x: -0.1, y: 0.2, w: 1.5, h: 0.05 });
    expect(ann.page).toBe(2);
    expect(ann.rect.x).toBe(0);
    expect(ann.rect.w).toBe(1);
    expect(ann.kind).toBe("highlight");
  });

  it("filters annotations by page", () => {
    const a = createPdfAnnotation(1, { x: 0, y: 0, w: 0.2, h: 0.1 });
    const b = createPdfAnnotation(3, { x: 0, y: 0, w: 0.2, h: 0.1 });
    expect(annotationsForPage([a, b], 3)).toEqual([b]);
  });
});
