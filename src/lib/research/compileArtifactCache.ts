import type { CompileBundle } from "@/lib/research/compileBundle";
import { hashCompileBundle } from "@/lib/research/compileBundleHash";
import { getCompileArtifactFromIdb, putCompileArtifactIdb } from "@/lib/research/compileArtifactIdb";
import { isDesktopApp } from "@/lib/isDesktopApp";

export type CompileCacheResult =
  | { hit: true; blob: Blob }
  | { hit: false };

/** Try compile artifact cache (IndexedDB web; desktop via IPC when wired). */
export async function getCachedCompilePdf(
  bundle: CompileBundle,
  projectId?: string
): Promise<CompileCacheResult> {
  const hash = await hashCompileBundle(bundle);
  if (isDesktopApp() && projectId && window.openbenttResearch?.getCompileArtifact) {
    const r = await window.openbenttResearch.getCompileArtifact(projectId, hash);
    if (r?.ok && r.base64) {
      const bin = atob(r.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return { hit: true, blob: new Blob([bytes], { type: "application/pdf" }) };
    }
    return { hit: false };
  }
  const buf = await getCompileArtifactFromIdb(hash);
  if (buf) return { hit: true, blob: new Blob([buf], { type: "application/pdf" }) };
  return { hit: false };
}

export async function storeCachedCompilePdf(
  bundle: CompileBundle,
  blob: Blob,
  projectId?: string
): Promise<void> {
  const hash = await hashCompileBundle(bundle);
  const buf = await blob.arrayBuffer();
  if (isDesktopApp() && projectId && window.openbenttResearch?.putCompileArtifact) {
    const bytes = new Uint8Array(buf);
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    await window.openbenttResearch.putCompileArtifact(projectId, hash, btoa(bin), {
      summary: bundle.summary,
    });
    return;
  }
  await putCompileArtifactIdb(hash, buf, { summary: bundle.summary });
}

export { hashCompileBundle };
