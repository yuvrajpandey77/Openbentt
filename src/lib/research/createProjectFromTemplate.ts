import { applyTemplatePack } from "@/lib/research/applyTemplate";
import { createResearchProject, saveResearchProject } from "@/lib/research/projectStore";
import { loadTemplatePack, type TemplateCatalogEntry } from "@/lib/research/templateCatalog";
import type { ResearchProjectData } from "@/types/researchProject";

/** Create a new project and apply a template pack in one step. */
export async function createProjectFromTemplate(
  title: string,
  entry: TemplateCatalogEntry
): Promise<ResearchProjectData> {
  const pack = await loadTemplatePack(entry.pack);
  const base = await createResearchProject(title.trim() || entry.label);
  const merged = applyTemplatePack(base, pack, { replaceProjectFiles: true });
  await saveResearchProject(merged);
  return merged;
}
