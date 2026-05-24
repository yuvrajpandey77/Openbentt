import { parseBibtex } from "@/lib/bibtex";
import { buildCorpusChunks } from "@/lib/research/corpusIndex";
import { rebuildResearchMemory, emptyResearchMemory } from "@/lib/research/researchMemory";
import {
  estimateJsonBytes,
  LIMITS,
} from "@/lib/research/projectLimits";
import {
  parseProjectJsonSafe,
  stripEmbeddingsForWebPersist,
} from "@/lib/research/projectRecovery";
import { migrateProjectIntegrity } from "@/lib/research/contentIntegrity";
import { migrateProjectFolders } from "@/lib/research/folderMigration";
import {
  clearEmbeddingsDesktop,
  loadEmbeddingsDesktop,
  patchBibliographyDesktop,
  patchDraftDesktop,
  patchKnowledgeDesktop,
  upsertEmbeddingsDesktop,
} from "@/lib/research/researchDesktopApi";
import { clearIndexCheckpoint } from "@/lib/research/indexCheckpoint";
import type { ResearchProjectData, ResearchProjectSummary } from "@/types/researchProject";
import { isDesktopApp } from "@/lib/isDesktopApp";

const INDEX_KEY = "openbentt-research-projects-index";
const EMBEDDINGS_KEY = (id: string) => `openbentt-research-embeddings-${id}`;
const projectKey = (id: string) => `openbentt-research-project-${id}`;

function uuid(): string {
  return crypto.randomUUID?.() ?? `rp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function readIndex(): { activeId: string | null; projects: ResearchProjectSummary[] } {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return { activeId: null, projects: [] };
    return JSON.parse(raw) as { activeId: string | null; projects: ResearchProjectSummary[] };
  } catch {
    return { activeId: null, projects: [] };
  }
}

function writeIndex(activeId: string | null, projects: ResearchProjectSummary[]) {
  localStorage.setItem(INDEX_KEY, JSON.stringify({ activeId, projects }));
}

function hydrate(data: ResearchProjectData): ResearchProjectData {
  const bibEntries = parseBibtex(data.bibliography);
  const chunks =
    data.chunks.length > 0
      ? data.chunks
      : isDesktopApp() && window.openbenttResearch
        ? []
        : buildCorpusChunks(
            data.papers.map((p) => ({ id: p.id, fileName: p.fileName, extractedText: p.extractedText })),
            data.draftTex,
            data.id
          );
  return migrateProjectFolders({
    ...data,
    bibEntries,
    chunks,
    captionSuggestions: data.captionSuggestions ?? [],
    researchMemory: rebuildResearchMemory({
      papers: data.papers,
      bibliography: data.bibliography,
      bibEntries,
      draftTex: data.draftTex,
      revisionSuggestions: data.revisionSuggestions,
      previous: data.researchMemory ?? emptyResearchMemory(),
    }),
  });
}

function loadEmbeddingsLocal(projectId: string): Record<string, number[]> | undefined {
  try {
    const raw = localStorage.getItem(EMBEDDINGS_KEY(projectId));
    if (!raw) return undefined;
    return JSON.parse(raw) as Record<string, number[]>;
  } catch {
    return undefined;
  }
}

function saveEmbeddingsLocal(projectId: string, vectors: Record<string, number[]> | undefined): void {
  if (!vectors || !Object.keys(vectors).length) {
    localStorage.removeItem(EMBEDDINGS_KEY(projectId));
    return;
  }
  try {
    localStorage.setItem(EMBEDDINGS_KEY(projectId), JSON.stringify(vectors));
  } catch {
    /* quota */
  }
}

function defaultProject(title: string): ResearchProjectData {
  const id = uuid();
  const now = new Date().toISOString();
  const draftTex = `\\documentclass[11pt,a4paper]{article}
\\usepackage[utf8]{inputenc}
\\usepackage{amsmath,amssymb,graphicx}
\\title{${title}}
\\author{Author}
\\date{\\today}
\\begin{document}
\\maketitle
\\begin{abstract}
% Meridian 0.1 can generate your abstract from the Write tab.
\\end{abstract}
\\section{Introduction}
\\end{document}
`;
  return hydrate({
    id,
    title,
    createdAt: now,
    updatedAt: now,
    targetVenue: "generic",
    linkedThreadIds: [],
    knowledge: "",
    draftTex,
    bibliography: "",
    bibEntries: [],
    papers: [],
    chunks: [],
    revisionSuggestions: [],
    modelAttributions: [],
    abstractVariants: [],
    keywordSuggestions: [],
    captionSuggestions: [],
    projectFiles: [],
  });
}

async function attachEmbeddings(data: ResearchProjectData): Promise<ResearchProjectData> {
  if (isDesktopApp()) {
    return data;
  }
  const local = loadEmbeddingsLocal(data.id);
  return local ? { ...data, chunkEmbeddings: local } : data;
}

async function desktopList(): Promise<ResearchProjectSummary[]> {
  const api = window.openbenttResearch;
  if (!api) return readIndex().projects;
  return api.listProjects();
}

async function desktopLoad(id: string): Promise<ResearchProjectData | null> {
  const api = window.openbenttResearch;
  if (!api) return loadProjectLocal(id);
  const raw = await api.loadProject(id);
  if (!raw) return null;
  return attachEmbeddings(hydrate(raw as ResearchProjectData));
}

async function desktopSave(data: ResearchProjectData, opts?: { skipChunks?: boolean }): Promise<void> {
  const api = window.openbenttResearch;
  const updated = { ...data, updatedAt: new Date().toISOString() };
  const hydrated = hydrate(updated);
  const { chunkEmbeddings, chunks: _chunks, ...meta } = hydrated;

  if (api) {
    await api.saveProject({ ...meta, skipChunks: opts?.skipChunks === true });
    if (chunkEmbeddings && Object.keys(chunkEmbeddings).length) {
      const batch = Object.entries(chunkEmbeddings)
        .filter(([k]) => k !== "__query__")
        .map(([chunkId, vector]) => ({ chunkId, vector }));
      if (batch.length) await upsertEmbeddingsDesktop(hydrated.id, batch);
    } else {
      await clearEmbeddingsDesktop(hydrated.id);
    }
  } else {
    saveProjectLocal(hydrated);
  }

  if (isDesktopApp() && api) return;

  const idx = readIndex();
  const summary: ResearchProjectSummary = {
    id: hydrated.id,
    title: hydrated.title,
    createdAt: hydrated.createdAt,
    updatedAt: hydrated.updatedAt,
    paperCount: hydrated.papers.length,
  };
  const projects = idx.projects.filter((p) => p.id !== hydrated.id);
  projects.unshift(summary);
  writeIndex(hydrated.id, projects);
}

function loadProjectLocal(id: string): ResearchProjectData | null {
  try {
    const raw = localStorage.getItem(projectKey(id));
    if (!raw) return null;
    const parsed = parseProjectJsonSafe(raw);
    if (!parsed) return null;
    const hydrated = hydrate(parsed);
    const local = loadEmbeddingsLocal(id);
    return local ? { ...hydrated, chunkEmbeddings: local } : hydrated;
  } catch {
    return null;
  }
}

function saveProjectLocal(data: ResearchProjectData): void {
  const hydrated = hydrate(data);
  const toStore = stripEmbeddingsForWebPersist(hydrated);
  const bytes = estimateJsonBytes(toStore);
  if (bytes > LIMITS.maxLocalStorageProjectBytes) {
    console.warn(
      `[projectStore] Project JSON ~${(bytes / 1e6).toFixed(1)}MB — embeddings stored separately.`
    );
  }
  localStorage.setItem(projectKey(data.id), JSON.stringify(toStore));
  if (hydrated.chunkEmbeddings) {
    saveEmbeddingsLocal(data.id, hydrated.chunkEmbeddings);
  }
}

export type SaveProjectWarning = {
  kind: "storage-pressure" | "quota";
  message: string;
};

export async function listResearchProjects(): Promise<ResearchProjectSummary[]> {
  const raw = isDesktopApp() ? await desktopList() : readIndex().projects;
  return raw.map((p) => ({
    ...p,
    createdAt: p.createdAt ?? p.updatedAt,
  }));
}

export async function getActiveProjectId(): Promise<string | null> {
  if (isDesktopApp() && window.openbenttResearch?.getActiveProjectId) {
    return window.openbenttResearch.getActiveProjectId();
  }
  return readIndex().activeId;
}

export async function setActiveProjectId(id: string | null): Promise<void> {
  if (isDesktopApp() && window.openbenttResearch?.setActiveProjectId) {
    await window.openbenttResearch.setActiveProjectId(id);
    return;
  }
  const idx = readIndex();
  writeIndex(id, idx.projects);
}

export async function createResearchProject(
  title: string,
  opts?: { draftTex?: string; bibliography?: string }
): Promise<ResearchProjectData> {
  const p = defaultProject(title.trim() || "Untitled research");
  if (opts?.draftTex) p.draftTex = opts.draftTex;
  if (opts?.bibliography) p.bibliography = opts.bibliography;
  await desktopSave(p);
  await setActiveProjectId(p.id);
  return p;
}

export async function loadResearchProject(id: string): Promise<ResearchProjectData | null> {
  const raw = isDesktopApp() ? await desktopLoad(id) : loadProjectLocal(id);
  if (!raw) return null;
  const report = migrateProjectIntegrity(raw);
  if (report.changed) {
    await saveResearchProject(report.project);
  }
  return report.project;
}

/** Patch draft only — avoids full project JSON rewrite on each keystroke (desktop SQLite). */
export async function patchProjectDraft(projectId: string, draftTex: string): Promise<void> {
  if (isDesktopApp()) {
    await patchDraftDesktop(projectId, draftTex);
    return;
  }
  const current = loadProjectLocal(projectId);
  if (!current) return;
  const next = hydrate({ ...current, draftTex, updatedAt: new Date().toISOString() });
  saveProjectLocal(next);
}

/** Patch bibliography without rebuilding entire project blob on every edit. */
export async function patchProjectBibliography(projectId: string, bibliography: string): Promise<void> {
  if (isDesktopApp()) {
    await patchBibliographyDesktop(projectId, bibliography);
    return;
  }
  const current = loadProjectLocal(projectId);
  if (!current) return;
  const next = hydrate({ ...current, bibliography, updatedAt: new Date().toISOString() });
  saveProjectLocal(next);
}

export async function saveResearchProject(
  data: ResearchProjectData,
  opts?: { skipChunks?: boolean }
): Promise<ResearchProjectData> {
  const hydrated = hydrate(data);
  await desktopSave(hydrated, opts);
  return attachEmbeddings(hydrated);
}

export async function saveProjectEmbeddingsOnly(
  projectId: string,
  vectors: Record<string, number[]>
): Promise<void> {
  if (isDesktopApp()) {
    const batch = Object.entries(vectors)
      .filter(([k]) => k !== "__query__")
      .map(([chunkId, vector]) => ({ chunkId, vector }));
    if (batch.length) await upsertEmbeddingsDesktop(projectId, batch);
    return;
  }
  saveEmbeddingsLocal(projectId, vectors);
}

export async function patchProjectKnowledge(
  projectId: string,
  content: string
): Promise<void> {
  if (isDesktopApp()) {
    await patchKnowledgeDesktop(projectId, content);
    return;
  }
  // Web: update localStorage project directly
  const proj = loadProjectLocal(projectId);
  if (proj) saveProjectLocal({ ...proj, knowledge: content });
}

export async function deleteResearchProject(id: string): Promise<void> {
  const api = window.openbenttResearch;
  if (api) {
    await api.deleteProject(id);
    return;
  }
  localStorage.removeItem(projectKey(id));
  localStorage.removeItem(EMBEDDINGS_KEY(id));
  const idx = readIndex();
  const projects = idx.projects.filter((p) => p.id !== id);
  const activeId = idx.activeId === id ? (projects[0]?.id ?? null) : idx.activeId;
  writeIndex(activeId, projects);
}

export async function addPaperToProject(
  project: ResearchProjectData,
  fileName: string,
  extractedText: string,
  metadata: ResearchProjectData["papers"][0]["metadata"],
  pdfBase64?: string,
  reviewNotes?: string[]
): Promise<ResearchProjectData> {
  const api = window.openbenttResearch;
  const id = uuid();
  if (api && pdfBase64) {
    await api.storePaperPdf(project.id, id, pdfBase64);
  }
  const paper = {
    id,
    fileName,
    addedAt: new Date().toISOString(),
    extractedText,
    metadata,
    reviewStatus: "unread" as const,
    ...(reviewNotes?.length ? { reviewNotes } : {}),
  };
  const papers = [...project.papers, paper];
  saveEmbeddingsLocal(project.id, undefined);
  clearIndexCheckpoint(project.id);
  const next = hydrate({ ...project, papers, chunks: [], chunkEmbeddings: undefined });
  return saveResearchProject(next);
}
