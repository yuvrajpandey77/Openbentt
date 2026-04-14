export interface HfDatasetCard {
  id: string;
  author?: string;
  downloaded?: number;
  likes?: number;
  tags?: string[];
  gated?: boolean;
  lastModified?: string;
  description?: string;
  citation?: string;
}

export async function fetchHfDatasetCard(datasetId: string, signal?: AbortSignal): Promise<HfDatasetCard | null> {
  const id = datasetId.trim();
  if (!id) return null;
  const u = `https://huggingface.co/api/datasets/${encodeURIComponent(id)}`;
  const res = await fetch(u, { signal, mode: "cors" });
  if (!res.ok) return null;
  const j = (await res.json()) as {
    id?: string;
    author?: string;
    downloads?: number;
    likes?: number;
    tags?: Array<{ label?: string } | string>;
    gated?: boolean;
    lastModified?: string;
    description?: string;
    citation?: string;
  };
  const tags = Array.isArray(j.tags)
    ? j.tags.map((t) => (typeof t === "string" ? t : t.label ?? "")).filter(Boolean)
    : [];
  return {
    id: j.id ?? id,
    author: j.author,
    downloaded: j.downloads,
    likes: j.likes,
    tags,
    gated: j.gated,
    lastModified: j.lastModified,
    description: j.description,
    citation: j.citation,
  };
}

export function hfDatasetViewerUrl(datasetId: string): string {
  return `https://huggingface.co/datasets/${encodeURIComponent(datasetId)}`;
}
