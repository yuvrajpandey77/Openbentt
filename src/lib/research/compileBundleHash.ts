import type { CompileBundle, CompileFileInput } from "@/lib/research/compileBundle";

function stableFileContent(f: CompileFileInput): string {
  if (typeof f.content === "string") return f.content;
  return Array.from(f.content)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Deterministic SHA-256 hash of compile bundle inputs (for artifact cache keys). */
export async function hashCompileBundle(bundle: CompileBundle): Promise<string> {
  const parts = [
    bundle.mainPath,
    bundle.mainTex,
    bundle.bibtex ? "1" : "0",
    ...bundle.additionalFiles
      .map((f) => `${f.path}:${stableFileContent(f)}`)
      .sort(),
  ].join("\n---\n");

  const data = new TextEncoder().encode(parts);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type CompileCacheEntry = {
  hash: string;
  createdAt: string;
  summary: string;
  sizeBytes: number;
};
