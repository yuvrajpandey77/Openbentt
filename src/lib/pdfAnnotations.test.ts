import { describe, expect, it } from "vitest";
import { pdfReviewNotesToCommentText } from "@/lib/pdfAnnotations";
import type { PdfReviewNote } from "@/lib/pdfAnnotations";

describe("pdfAnnotations", () => {
  it("formats review notes for revision panel", () => {
    const notes: PdfReviewNote[] = [
      { page: 2, text: "Clarify the baseline comparison.", subtype: "Text" },
      { page: 4, text: "Typo in equation (3).", subtype: "FreeText" },
    ];
    const out = pdfReviewNotesToCommentText(notes);
    expect(out).toContain("[p.2]");
    expect(out).toContain("baseline");
    expect(out).toContain("[p.4]");
  });
});
