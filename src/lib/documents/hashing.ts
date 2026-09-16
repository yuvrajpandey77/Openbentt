/**
 * Phase 2 — Document identity (SHA-256 content hashing).
 * Async WebCrypto-first with a Node fallback; sync FNV-1a only for
 * non-identity uses (chunk checksums in hot paths). No new dependency.
 */

export function fnv1aHex(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (`0000000${(h >>> 0).toString(16)}`).slice(-8);
}

function bytesToHex(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let out = "";
  for (let i = 0; i < u8.length; i++) out += u8[i].toString(16).padStart(2, "0");
  return out;
}

function toBytes(input: string | Uint8Array | ArrayBuffer): Uint8Array {
  if (typeof input === "string") return new TextEncoder().encode(input);
  if (input instanceof Uint8Array) return input;
  return new Uint8Array(input);
}

/** SHA-256 hex digest. Uses WebCrypto when available, Node crypto otherwise. */
export async function sha256Hex(input: string | Uint8Array | ArrayBuffer): Promise<string> {
  const bytes = toBytes(input);
  try {
    const subtle =
      (globalThis as unknown as { crypto?: { subtle?: SubtleCrypto } }).crypto?.subtle;
    if (subtle) {
      const digest = await subtle.digest(
        "SHA-256",
        bytes.slice(0) as unknown as ArrayBuffer
      );
      return bytesToHex(digest);
    }
  } catch {
    /* fall through to Node */
  }
  try {
    const mod = await import("node:crypto");
    const createHash =
      (mod as unknown as { createHash?: (alg: string) => { update: (b: Uint8Array) => { digest: (e: string) => string } } })
        .createHash ?? (mod as unknown as { default?: { createHash: (alg: string) => { update: (b: Uint8Array) => { digest: (e: string) => string } } } }).default?.createHash;
    if (createHash) return createHash("sha256").update(bytes).digest("hex");
  } catch {
    /* fall through */
  }
  throw new Error("SHA-256 unavailable in this runtime");
}

/** Stable document id derived from content hash (prefix keeps ids greppable). */
export function documentIdForChecksum(checksumHex: string): string {
  return `doc_${checksumHex.slice(0, 16)}`;
}
