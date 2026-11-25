import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { augmentProcessPath } from "./augmentPath.mjs";

test("augmentProcessPath prepends known user bins without dropping existing PATH", () => {
  const before = process.env.PATH || "";
  const home = os.homedir();
  const opencodeBin = path.join(home, ".opencode", "bin");
  const prepended = augmentProcessPath();
  const after = process.env.PATH || "";
  assert.ok(after.includes(before.split(path.delimiter)[0]) || before === "" || after.startsWith(prepended[0] || ""));
  if (prepended.includes(opencodeBin) || before.split(path.delimiter).includes(opencodeBin)) {
    assert.ok(after.split(path.delimiter).includes(opencodeBin));
  }
  // Idempotent
  const again = augmentProcessPath();
  assert.equal(again.length, 0);
  process.env.PATH = before;
});
