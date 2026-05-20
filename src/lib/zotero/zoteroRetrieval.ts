import type {
  ZoteroCitationRecommendation,
  ZoteroItem,
  ZoteroLibrarySnapshot,
} from "@/types/zotero";

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

function overlapScore(queryTokens: string[], text: string): number {
  const doc = new Set(tokenize(text));
  if (!doc.size) return 0;
  let hit = 0;
  for (const t of queryTokens) if (doc.has(t)) hit++;
  return hit / queryTokens.length;
}

export interface ZoteroRetrievalOptions {
  collectionKeys?: string[];
  tags?: string[];
  limit?: number;
  excludeCitekeys?: string[];
}

/** Recommend citations from Zotero library for draft context. */
export function recommendCitations(
  snapshot: ZoteroLibrarySnapshot,
  draftExcerpt: string,
  opts: ZoteroRetrievalOptions = {}
): ZoteroCitationRecommendation[] {
  const limit = opts.limit ?? 8;
  const qTokens = tokenize(draftExcerpt);
  if (!qTokens.length) return [];

  const collectionSet = opts.collectionKeys?.length ? new Set(opts.collectionKeys) : null;
  const tagSet = opts.tags?.length ? new Set(opts.tags.map((t) => t.toLowerCase())) : null;
  const exclude = new Set(opts.excludeCitekeys ?? []);

  const collectionName = (keys: string[]) =>
    keys
      .map((k) => snapshot.collections.find((c) => c.key === k)?.name)
      .filter(Boolean) as string[];

  const scored: ZoteroCitationRecommendation[] = [];

  for (const item of snapshot.items) {
    if (exclude.has(item.citekey)) continue;
    if (collectionSet && !item.collectionKeys.some((k) => collectionSet.has(k))) continue;
    if (tagSet && !item.tags.some((t) => tagSet.has(t.toLowerCase()))) continue;

    const corpus = [item.title, item.abstract ?? "", item.creators, item.tags.join(" ")].join(" ");
    const score = overlapScore(qTokens, corpus);
    if (score <= 0) continue;

    const cols = collectionName(item.collectionKeys);
    scored.push({
      citekey: item.citekey,
      title: item.title,
      score,
      reason:
        item.tags.length > 0
          ? `Tag overlap: ${item.tags.slice(0, 3).join(", ")}`
          : `Title/abstract overlap with draft`,
      collections: cols,
      tags: item.tags,
      provenance: `Zotero · ${item.key}`,
    });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Build literature-review prompt context from Zotero library slice. */
export function literatureReviewContext(
  snapshot: ZoteroLibrarySnapshot,
  opts: ZoteroRetrievalOptions & { topic?: string } = {}
): string {
  const topic = opts.topic ?? "";
  const recs = recommendCitations(snapshot, topic, { ...opts, limit: 12 });
  if (!recs.length) return "No matching Zotero items for this topic.";

  const lines = recs.map((r) => {
    const item = snapshot.items.find((i) => i.citekey === r.citekey);
    return `- [${r.citekey}] ${r.title}${item?.year ? ` (${item.year})` : ""}${item?.abstract ? `\n  ${item.abstract.slice(0, 300)}` : ""}`;
  });

  return `Zotero library sources (${snapshot.mode}, synced ${snapshot.syncedAt}):\n${lines.join("\n")}`;
}

export function itemsInCollection(snapshot: ZoteroLibrarySnapshot, collectionKey: string): ZoteroItem[] {
  return snapshot.items.filter((i) => i.collectionKeys.includes(collectionKey));
}

export function itemsWithTag(snapshot: ZoteroLibrarySnapshot, tag: string): ZoteroItem[] {
  const t = tag.toLowerCase();
  return snapshot.items.filter((i) => i.tags.some((x) => x.toLowerCase() === t));
}
