import { describe, expect, it } from "vitest";
import { canAddPdfConnection, canAddTexConnection, CONNECTION_CAPS } from "@/lib/research/connectionCaps";

describe("connectionCaps", () => {
  it("enforces tex and pdf limits", () => {
    expect(canAddTexConnection(CONNECTION_CAPS.maxTexFileKeys - 1)).toBe(true);
    expect(canAddTexConnection(CONNECTION_CAPS.maxTexFileKeys)).toBe(false);
    expect(canAddPdfConnection(CONNECTION_CAPS.maxPdfPaperIds - 1)).toBe(true);
    expect(canAddPdfConnection(CONNECTION_CAPS.maxPdfPaperIds)).toBe(false);
  });
});
