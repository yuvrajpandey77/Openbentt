/**
 * One-click import of LaTeX projects from ZIP (Overleaf / Prism / Codex / Openbentt export)
 * or a folder picked via webkitdirectory.
 */
import JSZip from "jszip";
import type { ProjectFileKind } from "@/types/researchProject";

export type ImportedArchive = {
  title: string;
  draftTex: string;
  bibliography: string;
  projectFiles: { path: string; kind: ProjectFileKind; content: string }[];
  source: "zip" | "folder" | "tex" | "bib";
  fileCount: number;
};

function kindForPath(p: string): ProjectFileKind {
  if (/\.tex$/i.test(p)) return "tex";
  if (/\.bib$/i.test(p)) return "bib";
  if (/\.sty$/i.test(p)) return "sty";
  if (/\.(png|jpe?g|pdf|eps|svg)$/i.test(p)) return "asset";
  return "other";
}

function pickMainTex(paths: string[]): string | null {
  const ranked = [
    /^main\.tex$/i,
    /^paper\.tex$/i,
    /^manuscript\.tex$/i,
    /^article\.tex$/i,
    /^thesis\.tex$/i,
    /\/main\.tex$/i,
  ];
  for (const re of ranked) {
    const hit = paths.find((p) => re.test(p.replace(/\\/g, "/")));
    if (hit) return hit;
  }
  return paths.find((p) => /\.tex$/i.test(p)) ?? null;
}

function normalizeZipPath(name: string): string {
  return name.replace(/\\/g, "/").replace(/^\.\//, "");
}

/** Strip a single shared root folder (Overleaf/Prism zip layout). */
function stripCommonRoot(paths: string[]): (p: string) => string {
  const parts = paths.map((p) => normalizeZipPath(p).split("/").filter(Boolean));
  if (parts.length === 0) return (p) => normalizeZipPath(p);
  const first = parts[0][0];
  const shared =
    Boolean(first) &&
    parts.every((segs) => segs.length > 1 && segs[0] === first) &&
    !parts.some((segs) => segs.length === 1);
  if (!shared) return (p) => normalizeZipPath(p);
  return (p) => normalizeZipPath(p).replace(new RegExp(`^${first}/`), "");
}

function assembleFromEntries(
  entries: { path: string; text: string }[],
  title: string,
  source: ImportedArchive["source"],
  fileCount: number
): ImportedArchive {
  const paths = entries.map((e) => e.path);
  const mainPath = pickMainTex(paths);
  const byPath = new Map(entries.map((e) => [e.path, e.text]));
  const draftTex = mainPath ? byPath.get(mainPath) ?? "" : "";
  const bibPath =
    paths.find((p) => /references\.bib$/i.test(p)) || paths.find((p) => /\.bib$/i.test(p));
  const bibliography = bibPath ? byPath.get(bibPath) ?? "" : "";
  const projectFiles = entries
    .filter((e) => e.path !== mainPath && e.path !== bibPath)
    .filter((e) => /\.(tex|bib|sty|cls|md|txt|json)$/i.test(e.path))
    .slice(0, 80)
    .map((e) => ({ path: e.path, kind: kindForPath(e.path), content: e.text }));

  if (!draftTex && !bibliography && projectFiles.length === 0) {
    throw new Error("No .tex / .bib / text sources found to import.");
  }

  return {
    title,
    draftTex:
      draftTex ||
      `\\documentclass{article}\n\\begin{document}\n% Imported project\n\\end{document}\n`,
    bibliography,
    projectFiles,
    source,
    fileCount,
  };
}

export async function importProjectFromZip(file: File): Promise<ImportedArchive> {
  const buf = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir && !n.includes("__MACOSX"));
  const rel = stripCommonRoot(names);
  const entries: { path: string; text: string }[] = [];

  for (const name of names) {
    const path = rel(name);
    if (!path || path.startsWith(".")) continue;
    if (/\.(png|jpe?g|gif|webp|pdf|eps|woff2?|ttf|otf)$/i.test(path)) continue;
    if (!/\.(tex|bib|sty|cls|md|txt|json)$/i.test(path)) continue;
    entries.push({ path, text: await zip.files[name].async("string") });
  }

  const title =
    file.name.replace(/\.zip$/i, "").replace(/[-_]+/g, " ").trim() || "Imported project";
  return assembleFromEntries(entries, title, "zip", names.length);
}

/** Import files from a folder picker (input[webkitdirectory]). */
export async function importProjectFromFolderFiles(files: FileList | File[]): Promise<ImportedArchive> {
  const list = Array.from(files);
  if (!list.length) throw new Error("No files selected");

  const entries: { path: string; text: string }[] = [];
  for (const f of list) {
    const raw = (f.webkitRelativePath || f.name).replace(/\\/g, "/");
    const path = raw.includes("/") ? raw.replace(/^[^/]+\//, "") : raw;
    if (!/\.(tex|bib|sty|cls|md|txt|json)$/i.test(path)) continue;
    entries.push({ path, text: await f.text() });
  }

  const rootName = list[0]?.webkitRelativePath?.split("/")[0] || "Imported folder";
  return assembleFromEntries(entries, rootName.replace(/[-_]+/g, " "), "folder", list.length);
}
