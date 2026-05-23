import type { TargetVenue } from "@/types/researchProject";

export type TemplateCatalogEntry = {
  id: string;
  label: string;
  description: string;
  pack: string;
  tags?: string[];
  venue?: TargetVenue;
  requiresLocalTex?: boolean;
  /** Compile-verified hero template (Local TeX or WASM). */
  verified?: boolean;
  /** Show on projects home featured row. */
  featured?: boolean;
};

export type TemplateCatalog = {
  version: string;
  targetRelease?: string;
  templates: TemplateCatalogEntry[];
};

let catalogCache: TemplateCatalog | null = null;

export async function loadTemplateCatalog(): Promise<TemplateCatalog> {
  if (catalogCache) return catalogCache;
  const res = await fetch("/templates/catalog.json");
  if (!res.ok) throw new Error("Failed to load template catalog");
  catalogCache = (await res.json()) as TemplateCatalog;
  return catalogCache;
}

export type TemplatePack = {
  draftTex: string;
  bibliography?: string;
  targetVenue?: TargetVenue;
  projectFiles?: Array<{ path: string; kind: "tex" | "bib" | "sty" | "asset" | "other"; content: string }>;
};

const packCache = new Map<string, TemplatePack>();

export async function loadTemplatePack(packFile: string): Promise<TemplatePack> {
  const cached = packCache.get(packFile);
  if (cached) return cached;
  const res = await fetch(`/templates/packs/${packFile}`);
  if (!res.ok) throw new Error(`Template pack not found: ${packFile}`);
  const pack = (await res.json()) as TemplatePack;
  packCache.set(packFile, pack);
  return pack;
}

export function filterCatalogEntries(
  catalog: TemplateCatalog,
  query: string,
  opts?: { featuredOnly?: boolean; verifiedOnly?: boolean }
): TemplateCatalogEntry[] {
  let list = catalog.templates;
  if (opts?.featuredOnly) list = list.filter((t) => t.featured);
  if (opts?.verifiedOnly) list = list.filter((t) => t.verified || !t.requiresLocalTex);
  const q = query.trim().toLowerCase();
  if (!q) return list;
  return list.filter(
    (t) =>
      t.label.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.tags?.some((tag) => tag.toLowerCase().includes(q))
  );
}

/** One representative entry per pack (prefer featured + verified). */
export function featuredTemplateEntries(catalog: TemplateCatalog): TemplateCatalogEntry[] {
  const byPack = new Map<string, TemplateCatalogEntry>();
  for (const t of catalog.templates) {
    if (!t.featured && !t.verified) continue;
    const cur = byPack.get(t.pack);
    if (!cur || (t.featured && !cur.featured)) byPack.set(t.pack, t);
  }
  if (byPack.size > 0) return [...byPack.values()];
  const fallback = new Map<string, TemplateCatalogEntry>();
  for (const t of catalog.templates) {
    if (!fallback.has(t.pack)) fallback.set(t.pack, t);
  }
  return [...fallback.values()];
}
