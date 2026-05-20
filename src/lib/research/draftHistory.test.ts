import { describe, expect, it } from "vitest";
import { createDraftHistory, pushDraft, undoDraft, redoDraft, canUndo, canRedo } from "@/lib/research/draftHistory";

describe("draftHistory", () => {
  it("supports undo/redo without full project rebuild", () => {
    let state = createDraftHistory("v1");
    state = pushDraft(state, "v2")!;
    state = pushDraft(state, "v3")!;
    expect(state.present).toBe("v3");

    const u1 = undoDraft(state)!;
    expect(u1.present).toBe("v2");
    expect(canRedo(u1)).toBe(true);

    const r1 = redoDraft(u1)!;
    expect(r1.present).toBe("v3");
    expect(canUndo(r1)).toBe(true);
  });
});
