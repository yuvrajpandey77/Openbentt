import type { ProjectFile, ResearchProjectData, TargetVenue } from "@/types/researchProject";
import type { TemplatePack } from "@/lib/research/templateCatalog";

export function applyTemplatePack(
  project: ResearchProjectData,
  pack: TemplatePack,
  opts?: { replaceProjectFiles?: boolean }
): ResearchProjectData {
  const now = new Date().toISOString();
  let projectFiles: ProjectFile[] = project.projectFiles ?? [];

  if (opts?.replaceProjectFiles !== false && pack.projectFiles?.length) {
    projectFiles = pack.projectFiles.map((pf) => ({
      id: crypto.randomUUID?.() ?? `pf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      path: pf.path,
      kind: pf.kind,
      content: pf.content,
      addedAt: now,
      updatedAt: now,
    }));
  } else if (pack.projectFiles?.length) {
    for (const pf of pack.projectFiles) {
      if (projectFiles.some((f) => f.path === pf.path)) continue;
      projectFiles.push({
        id: crypto.randomUUID?.() ?? `pf-${Date.now()}`,
        path: pf.path,
        kind: pf.kind,
        content: pf.content,
        addedAt: now,
        updatedAt: now,
      });
    }
  }

  return {
    ...project,
    draftTex: pack.draftTex,
    bibliography: pack.bibliography ?? project.bibliography,
    targetVenue: (pack.targetVenue as TargetVenue | undefined) ?? project.targetVenue,
    projectFiles,
    updatedAt: now,
  };
}
