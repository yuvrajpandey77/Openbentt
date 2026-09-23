import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { actionRisk, probeCapabilities } from "./computerUseService.mjs";

describe("computerUseService guards", () => {
  it("maps risk levels without a second permission system", () => {
    assert.equal(actionRisk("screenshot"), "LOW");
    assert.equal(actionRisk("click"), "MEDIUM");
    assert.equal(actionRisk("type"), "MEDIUM");
    assert.equal(actionRisk("drag"), "HIGH");
    assert.equal(actionRisk("nonsense"), "HIGH");
  });

  it("probes host capabilities honestly", () => {
    const caps = probeCapabilities();
    assert.equal(typeof caps.screenshot, "boolean");
    assert.equal(typeof caps.act, "boolean");
    assert.equal(caps.platform, process.platform);
  });

  it("quotes key allowlist narrowly", async () => {
    const { computerAct } = await import("./computerUseService.mjs");
    await assert.rejects(() => computerAct("key", { key: "ctrl+alt+Delete" }), /not allowed/);
    await assert.rejects(() => computerAct("open", { app: "rm" }), /not allowed/);
    await assert.rejects(() => computerAct("open", { app: "firefox", operand: "file:///etc/passwd" }), /https/);
    await assert.rejects(() => computerAct("selfdestruct", {}), /Unknown/);
    await assert.rejects(() => computerAct("click", { x: 999999, y: 0 }), /range/);
  });
});
