import type { CompileBundle, CompileFileInput } from "@/lib/research/compileBundle";
import { collectIncludegraphicsPaths, resolveAssetPathForGraphics } from "@/lib/research/compileBundle";
import { isLatexDocumentSource } from "@/lib/notebookSourceKind";

/**
 * Replace missing \includegraphics with placeholders; keep paths that exist in bundle assets.
 */
export function rewriteIncludegraphicsPlaceholders(tex: string, availableAssetNames: string[] = []): string {
  if (!isLatexDocumentSource(tex)) return tex;
  const re = /\\includegraphics(\[[^\]]*\])?\s*\{([^}]*)\}/g;
  if (!re.test(tex)) return tex;
  re.lastIndex = 0;
  return tex.replace(re, (full, opt: string, fname: string) => {
    const name = String(fname).trim();
    const resolved = resolveAssetPathForGraphics(name, availableAssetNames);
    if (resolved) {
      const assetPath = resolved.startsWith("assets/") ? resolved : `assets/${resolved}`;
      return `\\includegraphics${opt ?? ""}{${assetPath}}`;
    }
    const safe = name.replace(/\\/g, "\\textbackslash{}").replace(/_/g, "\\_");
    return (
      "\\fbox{\\begin{minipage}[t]{0.99\\linewidth}\\centering\\footnotesize " +
      "[Upload image to Assets in file tree, then reference it here]\\\\" +
      `\\texttt{${safe}}` +
      "\\end{minipage}}"
    );
  });
}

export function availableAssetNamesFromBundle(bundle: CompileBundle): string[] {
  const names: string[] = [];
  for (const f of bundle.additionalFiles) {
    if (f.path.startsWith("assets/")) {
      names.push(f.path.slice("assets/".length));
    }
  }
  return names;
}

export function graphicsPathsInBundle(bundle: CompileBundle): string[] {
  const allTex = [bundle.mainTex, ...bundle.additionalFiles.filter((f) => typeof f.content === "string").map((f) => f.content as string)];
  return allTex.flatMap(collectIncludegraphicsPaths);
}

export type { CompileFileInput };
