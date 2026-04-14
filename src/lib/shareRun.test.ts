import { describe, it, expect } from "vitest";
import { encodeShareSnapshot, decodeShareSnapshot, SHARE_PAYLOAD_VERSION } from "./shareRun";

describe("shareRun", () => {
  it("round-trips snapshot", () => {
    const snap = {
      v: SHARE_PAYLOAD_VERSION,
      title: "Test",
      frozenAt: new Date().toISOString(),
      messages: [
        {
          id: "1",
          role: "user" as const,
          content: "hi",
          timestamp: new Date().toISOString(),
        },
      ],
    };
    const enc = encodeShareSnapshot(snap);
    const out = decodeShareSnapshot(enc);
    expect(out?.title).toBe("Test");
    expect(out?.messages[0].content).toBe("hi");
  });
});
