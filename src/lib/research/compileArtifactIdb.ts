import type { CompileCacheEntry } from "@/lib/research/compileBundleHash";

const DB_NAME = "openbentt-compile-cache";
const STORE = "artifacts";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "hash" });
      }
    };
  });
}

type StoredArtifact = CompileCacheEntry & { pdf: ArrayBuffer };

export async function getCompileArtifactFromIdb(hash: string): Promise<ArrayBuffer | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(hash);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const row = req.result as StoredArtifact | undefined;
        resolve(row?.pdf ?? null);
      };
    });
  } catch {
    return null;
  }
}

export async function putCompileArtifactIdb(
  hash: string,
  pdf: ArrayBuffer,
  meta: { summary: string }
): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openDb();
    const entry: StoredArtifact = {
      hash,
      pdf,
      summary: meta.summary,
      createdAt: new Date().toISOString(),
      sizeBytes: pdf.byteLength,
    };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE).put(entry);
    });
  } catch {
    /* quota or private mode */
  }
}

export async function clearCompileArtifactIdb(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE).clear();
    });
  } catch {
    /* ignore */
  }
}
