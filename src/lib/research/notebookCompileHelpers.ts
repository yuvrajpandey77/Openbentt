import type { ResearchProjectData } from "@/types/researchProject";
import { buildCompileBundle, type CompileBundle } from "@/lib/research/compileBundle";
import { listProjectAssetsDesktop, loadProjectAssetDesktop } from "@/lib/research/researchDesktopApi";
import { isDesktopApp } from "@/lib/isDesktopApp";

/** Load asset bytes and build a full compile bundle from project state. */
export async function buildProjectCompileBundle(
  project: ResearchProjectData,
  opts?: { mainTexOverride?: string }
): Promise<CompileBundle> {
  let assetNames: string[] = [];
  const assetBytes: Record<string, string> = {};

  if (isDesktopApp()) {
    assetNames = await listProjectAssetsDesktop(project.id);
    await Promise.all(
      assetNames.map(async (name) => {
        const r = await loadProjectAssetDesktop(project.id, name);
        if (r?.ok && r.base64) assetBytes[name] = r.base64;
      })
    );
  }

  const mainTex =
    opts?.mainTexOverride ??
    (project.draftTex?.trim() ? project.draftTex : undefined) ??
    project.draftTex;

  return buildCompileBundle(project, {
    mainTex,
    assetNames,
    assetBytes,
  });
}
