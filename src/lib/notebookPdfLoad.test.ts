import { describe, expect, it } from "vitest";
import { shouldReplaceEditorSourceOnPdfLoad } from "@/lib/notebookPdfLoad";

describe("shouldReplaceEditorSourceOnPdfLoad", () => {
  it("never replaces editor source in studio mode", () => {
    expect(shouldReplaceEditorSourceOnPdfLoad("studio")).toBe(false);
    expect(shouldReplaceEditorSourceOnPdfLoad("studio", true)).toBe(false);
    expect(shouldReplaceEditorSourceOnPdfLoad("studio", false)).toBe(false);
  });

  it("replaces by default in legacy tabs mode", () => {
    expect(shouldReplaceEditorSourceOnPdfLoad("tabs")).toBe(true);
    expect(shouldReplaceEditorSourceOnPdfLoad("tabs", undefined)).toBe(true);
  });

  it("respects explicit replaceSource false in tabs mode", () => {
    expect(shouldReplaceEditorSourceOnPdfLoad("tabs", false)).toBe(false);
  });
});
