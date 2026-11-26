export type PaperOrchestraStage =
  | "idle"
  | "starting"
  | "outline"
  | "literature"
  | "plotting"
  | "sections"
  | "refine"
  | "running"
  | "log"
  | "complete"
  | "error"
  | "cancelled";

export type PaperOrchestraProgress = {
  runId?: string | null;
  stage?: PaperOrchestraStage | string;
  message?: string;
  done?: boolean;
  ok?: boolean;
  outputDir?: string;
};

export type PaperOrchestraArtifacts = {
  draftTex: string | null;
  bibliography: string | null;
  outline: string | null;
  citationMap: string | null;
  pdfPath: string | null;
  figureFiles: string[];
  latexDir: string;
  outputDir: string;
};

export type PaperOrchestraStartOpts = {
  idea: string;
  experimentalLog: string;
  venue: "cvpr2025" | "iclr2025";
  usePlotting?: boolean;
  ideaFilename?: string;
  experimentalLogFilename?: string;
  writerModelName?: string;
  reflectionModelName?: string;
  plottingModelName?: string;
  imageModelName?: string;
  researchCutoff?: string;
  plottingMaxCriticRounds?: number;
  figurePaths?: string[];
  extraMaterialFiles?: Array<{ name: string; text: string }>;
  envInject?: Record<string, string>;
};

export interface OpenbenttPaperOrchestraApi {
  status(): Promise<{
    root: string | null;
    python: string | null;
    ready: boolean;
    canInstall?: boolean;
    installing?: boolean;
    hasSystemPython?: boolean;
    venues: string[];
    running: boolean;
    runId: string | null;
    stage?: string;
    logLines?: string[];
    outputDir?: string | null;
    lastFinish?: { done: boolean; ok: boolean | null; message: string | null } | null;
    hint: string;
  }>;
  listVenues(): Promise<Array<{ id: string; path: string; label: string }>>;
  /** One-time: create userData venv + pip install requirements (needs network). */
  installEngine(): Promise<{ ok: boolean; python: string }>;
  start(opts: PaperOrchestraStartOpts): Promise<{
    runId: string;
    outputDir: string;
    artifacts: PaperOrchestraArtifacts;
  }>;
  cancel(): Promise<{ ok: boolean }>;
  importArtifacts(outputDir: string): Promise<PaperOrchestraArtifacts>;
  onProgress(cb: (payload: PaperOrchestraProgress) => void): () => void;
}

export function getPaperOrchestraApi(): OpenbenttPaperOrchestraApi | undefined {
  if (typeof window === "undefined") return undefined;
  return window.openbenttPaperOrchestra;
}

export const ORCHESTRA_STAGES: Array<{ id: PaperOrchestraStage; label: string }> = [
  { id: "outline", label: "Outline" },
  { id: "literature", label: "Literature" },
  { id: "plotting", label: "Plotting" },
  { id: "sections", label: "Sections" },
  { id: "refine", label: "Refine" },
  { id: "complete", label: "PDF" },
];
