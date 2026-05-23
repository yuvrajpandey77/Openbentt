import type { ProjectFolder, ResearchProjectData } from "@/types/researchProject";

export const SYSTEM_FOLDER_IDS = {
  chapters: "folder-chapters",
  figures: "folder-figures",
  includes: "folder-includes",
  papers: "folder-papers",
  assets: "folder-assets",
} as const;

/** Default folder taxonomy matching legacy hard-coded tree. */
export function defaultProjectFolders(): ProjectFolder[] {
  return [
    { id: SYSTEM_FOLDER_IDS.chapters, label: "chapters", kind: "system", order: 0, pathPrefix: "chapters/" },
    { id: SYSTEM_FOLDER_IDS.figures, label: "figures", kind: "system", order: 1, pathPrefix: "figures/" },
    { id: SYSTEM_FOLDER_IDS.includes, label: "includes", kind: "system", order: 2 },
    { id: SYSTEM_FOLDER_IDS.papers, label: "papers", kind: "system", order: 3 },
    { id: SYSTEM_FOLDER_IDS.assets, label: "assets", kind: "system", order: 4, pathPrefix: "assets/" },
  ];
}

export function migrateProjectFolders(project: ResearchProjectData): ResearchProjectData {
  if (project.folders?.length) return project;
  return { ...project, folders: defaultProjectFolders() };
}

export function folderForProjectPath(folders: ProjectFolder[], path: string): ProjectFolder | undefined {
  const norm = path.replace(/\\/g, "/");
  const candidates = sortedFolders(folders).filter(
    (f) => f.pathPrefix && f.id !== SYSTEM_FOLDER_IDS.papers && f.id !== SYSTEM_FOLDER_IDS.assets
  );
  const match = [...candidates]
    .sort((a, b) => b.pathPrefix!.length - a.pathPrefix!.length)
    .find((f) => norm.startsWith(f.pathPrefix!));
  if (match) return match;
  return folders.find((f) => f.id === SYSTEM_FOLDER_IDS.includes);
}

export function sortedFolders(folders: ProjectFolder[]): ProjectFolder[] {
  return [...folders].sort((a, b) => a.order - b.order);
}
