import { describe, expect, it } from "vitest";
import {
  beginBackgroundWork,
  backgroundWorkCount,
  hasActiveBackgroundWork,
} from "./backgroundWork";

describe("backgroundWork", () => {
  it("tracks begin/release and hasActive", () => {
    expect(hasActiveBackgroundWork(["compile"])).toBe(false);
    const release = beginBackgroundWork("compile");
    expect(backgroundWorkCount("compile")).toBeGreaterThan(0);
    expect(hasActiveBackgroundWork(["compile"])).toBe(true);
    release();
    expect(hasActiveBackgroundWork(["compile"])).toBe(false);
  });
});
