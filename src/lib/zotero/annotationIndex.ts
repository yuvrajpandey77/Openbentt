import type {
  ZoteroAnnotation,
  ZoteroAnnotationHit,
  ZoteroItem,
  ZoteroLibrarySnapshot,
} from "@/types/zotero";

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function tf(tokens: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of tokens) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
}

function dot(a: Map<string, number>, b: Map<string, number>): number {
  let sum = 0;
  for (const [k, v] of a) {
    if (b.has(k)) sum += v * (b.get(k) ?? 0);
  }
  return sum;
}

function norm(m: Map<string, number>): number {
  let s = 0;
  for (const v of m.values()) s += v * v;
  return Math.sqrt(s) || 1;
}

/** Simple TF cosine search over Zotero annotations. */
export function searchAnnotations(
  snapshot: ZoteroLibrarySnapshot,
  query: string,
  limit = 20
): ZoteroAnnotationHit[] {
  const qTokens = tokenize(query);
  if (!qTokens.length) return [];
  const qVec = tf(qTokens);
  const itemByKey = new Map(snapshot.items.map((i) => [i.key, i]));
  const attachmentParent = new Map(
    snapshot.attachments.map((a) => [a.key, a.parentItemKey])
  );

  const hits: ZoteroAnnotationHit[] = [];

  for (const ann of snapshot.annotations) {
    const text = [ann.text, ann.comment].filter(Boolean).join(" ");
    if (!text.trim()) continue;
    const dVec = tf(tokenize(text));
    const score = dot(qVec, dVec) / (norm(qVec) * norm(dVec));
    if (score <= 0) continue;

    const parentKey = attachmentParent.get(ann.parentItemKey) ?? ann.parentItemKey;
    const item = itemByKey.get(parentKey);
    hits.push({
      annotation: ann,
      itemTitle: item?.title ?? "Unknown item",
      citekey: item?.citekey ?? "",
      score,
      snippet: text.slice(0, 240),
    });
  }

  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Link annotation to bibliographic item for jump-to-source. */
export function resolveAnnotationSource(
  snapshot: ZoteroLibrarySnapshot,
  annotationKey: string
): { item: ZoteroItem | null; annotation: ZoteroAnnotation | null } {
  const annotation = snapshot.annotations.find((a) => a.key === annotationKey) ?? null;
  if (!annotation) return { item: null, annotation: null };

  const attach = snapshot.attachments.find((a) => a.key === annotation.parentItemKey);
  const itemKey = attach?.parentItemKey ?? annotation.parentItemKey;
  const item = snapshot.items.find((i) => i.key === itemKey) ?? null;
  return { item, annotation };
}

export function annotationsForItem(
  snapshot: ZoteroLibrarySnapshot,
  itemKey: string
): ZoteroAnnotation[] {
  const item = snapshot.items.find((i) => i.key === itemKey);
  if (!item) return [];
  const keys = new Set([...item.annotationKeys, ...item.attachmentKeys]);
  return snapshot.annotations.filter(
    (a) =>
      a.parentItemKey === itemKey ||
      keys.has(a.parentItemKey) ||
      item.attachmentKeys.includes(a.parentItemKey)
  );
}
