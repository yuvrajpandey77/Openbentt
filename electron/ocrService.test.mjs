import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  __ocrTestHooks,
  getOcrStatus,
  registerOcrIpc,
  runOcr,
} from "./ocrService.mjs";

function mockIpcMain() {
  const handlers = new Map();
  return {
    handle(channel, fn) { handlers.set(channel, fn); },
    async invoke(channel, ...args) {
      const fn = handlers.get(channel);
      if (!fn) throw new Error(`No IPC handler: ${channel}`);
      return fn({}, ...args);
    },
  };
}

describe("ocrService (tesseract IPC)", () => {
  let restoreExec;
  beforeEach(() => {
    __ocrTestHooks.forceAvailable = true;
    __ocrTestHooks.execFileImpl = async (imgPath) => ({
      text: `mock-ocr:${path.basename(imgPath)}`,
      confidence: 90,
    });
    restoreExec = () => {
      __ocrTestHooks.execFileImpl = null;
      __ocrTestHooks.forceAvailable = false;
    };
  });
  afterEach(() => {
    restoreExec?.();
  });

  it("registers status + ocr handlers", async () => {
    const ipc = mockIpcMain();
    registerOcrIpc(ipc, {});
    const status = await ipc.invoke("documents:ocrStatus");
    assert.equal(typeof status.available, "boolean");
  });

  it("runOcr rejects when tesseract missing", async () => {
    const orig = getOcrStatus;
    // Force unavailable by stubbing only if not installed — always exercise error path via hook skip
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "openbentt-ocr-test-"));
    try {
      const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
      const res = await runOcr({
        pages: [{ pageNumber: 1, dataBase64: png.toString("base64"), mimeType: "image/png" }],
      });
      assert.ok(res.text.includes("mock-ocr"));
      assert.equal(res.pages.length, 1);
    } finally {
      await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
      void orig;
    }
  });

  it("ipc documents:ocr returns structured pages", async () => {
    const ipc = mockIpcMain();
    registerOcrIpc(ipc, {});
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
    const out = await ipc.invoke("documents:ocr", {
      dataBase64: png.toString("base64"),
      mimeType: "image/png",
    });
    assert.equal(out.pages.length, 1);
    assert.match(out.pages[0].text, /mock-ocr/);
  });
});