import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readOpenCodeAuthKeys } from "./paperOrchestraCredentials.mjs";

describe("paperOrchestraCredentials", () => {
  it("does not scrape OpenRouter keys from OpenCode auth (Paper uses OpenCode bridge)", () => {
    // Intentional: Paper must go through opencode run / local bridge, not auth.json keys.
    assert.equal(readOpenCodeAuthKeys(), null);
  });
});
