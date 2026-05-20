import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function runChunkWorker(payload) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, "chunkWorker.mjs"), {
      workerData: { type: "rechunk", payload },
    });
    worker.on("message", (msg) => {
      if (msg?.error) reject(new Error(msg.error));
      else resolve(msg.result);
    });
    worker.on("error", reject);
  });
}

describe("chunkWorker", () => {
  it("chunks papers and draft in worker thread", async () => {
    const chunks = await runChunkWorker({
      papers: [
        {
          id: "p1",
          extractedText:
            "Neural citation parsing methodology for large PDF libraries. ".repeat(40) +
            "We evaluate chunk overlap, semantic indexing, and offline thesis workflows at scale.",
        },
      ],
      draftTex: "\\section{Intro}\nWe study citation parsing.",
    });
    assert.ok(Array.isArray(chunks));
    assert.ok(chunks.length >= 2);
    assert.ok(chunks.some((c) => c.paperId === "p1"));
    assert.ok(chunks.some((c) => c.paperId === "draft"));
  });

  it("returns error for unknown worker type", async () => {
    await assert.rejects(
      () =>
        new Promise((resolve, reject) => {
          const worker = new Worker(path.join(__dirname, "chunkWorker.mjs"), {
            workerData: { type: "unknown", payload: {} },
          });
          worker.on("message", (msg) => {
            if (msg?.error) reject(new Error(msg.error));
            else resolve(msg);
          });
          worker.on("error", reject);
        }),
      /Unknown worker type/
    );
  });
});
