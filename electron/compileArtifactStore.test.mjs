import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  clearCompileCacheDesktop,
  getCompileArtifactDesktop,
  putCompileArtifactDesktop,
} from "./compileArtifactStore.mjs";

describe("compileArtifactStore desktop cache", () => {
  let tmpRoot;
  const app = { getPath: () => tmpRoot };

  before(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "openbentt-compile-cache-"));
  });

  after(async () => {
    await clearCompileCacheDesktop(app, "proj-1");
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("round-trips PDF bytes by bundle hash", async () => {
    const hash = "abc123";
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    await putCompileArtifactDesktop(app, "proj-1", hash, pdf, { summary: "main.tex" });
    const loaded = await getCompileArtifactDesktop(app, "proj-1", hash);
    assert.ok(loaded);
    assert.equal(new Uint8Array(loaded)[0], 0x25);
  });
});
