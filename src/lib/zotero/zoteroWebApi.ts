import type {
  ZoteroAnnotation,
  ZoteroAttachment,
  ZoteroCollection,
  ZoteroItem,
  ZoteroNote,
  ZoteroTag,
} from "@/types/zotero";

/** Raw Zotero Web API item (subset). */
export interface ZoteroApiItem {
  key: string;
  version: number;
  itemType: string;
  title?: string;
  creators?: { creatorType: string; firstName?: string; lastName?: string; name?: string }[];
  date?: string;
  DOI?: string;
  url?: string;
  abstractNote?: string;
  tags?: { tag: string; type?: number }[];
  collections?: string[];
  parentItem?: string;
  note?: string;
  contentType?: string;
  linkMode?: string;
  path?: string;
  annotationType?: string;
  annotationText?: string;
  annotationComment?: string;
  annotationPageLabel?: string;
  annotationColor?: string;
  extra?: string;
  /** Better BibTeX citation key in extra or dedicated export */
  citationKey?: string;
}

export interface ZoteroApiCollection {
  key: string;
  version: number;
  data: {
    key: string;
    name: string;
    parentCollection?: string | false;
  };
  meta?: { numItems?: number };
}

export interface ZoteroApiTag {
  tag: string;
  type?: number;
}

export interface ZoteroApiUser {
  userID: number;
  username: string;
}

export type ZoteroFetchFn = (url: string, init?: RequestInit) => Promise<Response>;

const ZOTERO_API = "https://api.zotero.org";

export function zoteroApiHeaders(apiKey: string): HeadersInit {
  return {
    "Zotero-API-Key": apiKey,
    "Zotero-API-Version": "3",
  };
}

export async function zoteroWhoami(
  fetchFn: ZoteroFetchFn,
  apiKey: string
): Promise<ZoteroApiUser> {
  const res = await fetchFn(`${ZOTERO_API}/keys/current`, {
    headers: zoteroApiHeaders(apiKey),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Zotero auth failed (${res.status}): ${body || res.statusText}`);
  }
  return res.json() as Promise<ZoteroApiUser>;
}

export async function zoteroFetchAllItems(
  fetchFn: ZoteroFetchFn,
  userId: string,
  apiKey: string,
  onProgress?: (current: number, total: number) => void
): Promise<ZoteroApiItem[]> {
  const out: ZoteroApiItem[] = [];
  let start = 0;
  const limit = 100;
  let total = 1;

  while (start < total) {
    const url = `${ZOTERO_API}/users/${userId}/items?limit=${limit}&start=${start}&include=data`;
    const res = await fetchFn(url, { headers: zoteroApiHeaders(apiKey) });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Zotero items fetch failed (${res.status}): ${body || res.statusText}`);
    }
    total = Number(res.headers.get("Total-Results") ?? out.length + limit);
    const json = (await res.json()) as { data: ZoteroApiItem }[];
    for (const row of json) {
      if (row.data) out.push(row.data);
    }
    start += limit;
    onProgress?.(Math.min(start, total), total);
  }
  return out;
}

export async function zoteroFetchCollections(
  fetchFn: ZoteroFetchFn,
  userId: string,
  apiKey: string
): Promise<ZoteroApiCollection[]> {
  const url = `${ZOTERO_API}/users/${userId}/collections?limit=100`;
  const res = await fetchFn(url, { headers: zoteroApiHeaders(apiKey) });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Zotero collections fetch failed (${res.status}): ${body || res.statusText}`);
  }
  return res.json() as Promise<ZoteroApiCollection[]>;
}

export async function zoteroFetchTags(
  fetchFn: ZoteroFetchFn,
  userId: string,
  apiKey: string
): Promise<ZoteroApiTag[]> {
  const url = `${ZOTERO_API}/users/${userId}/tags?limit=1000`;
  const res = await fetchFn(url, { headers: zoteroApiHeaders(apiKey) });
  if (!res.ok) return [];
  return res.json() as Promise<ZoteroApiTag[]>;
}

export function formatCreators(
  creators?: ZoteroApiItem["creators"]
): string {
  if (!creators?.length) return "";
  return creators
    .map((c) => c.name ?? [c.lastName, c.firstName].filter(Boolean).join(", "))
    .filter(Boolean)
    .join(" and ");
}

export function extractYear(date?: string): string | undefined {
  if (!date) return undefined;
  const m = date.match(/\d{4}/);
  return m?.[0];
}

/** Parse Better BibTeX citation key from Zotero `extra` field. */
export function parseCitationKeyFromExtra(extra?: string): string | undefined {
  if (!extra) return undefined;
  const m = extra.match(/(?:^|\n)\s*(?:Citation Key|citation key|bibtex:\s*)\s*:\s*(\S+)/i);
  return m?.[1];
}

export function defaultCitekey(item: ZoteroApiItem): string {
  const fromExtra = parseCitationKeyFromExtra(item.extra);
  if (fromExtra) return fromExtra;
  if (item.citationKey) return item.citationKey;
  const author = item.creators?.[0]?.lastName ?? item.creators?.[0]?.name ?? "item";
  const year = extractYear(item.date) ?? "nd";
  const slug = author.replace(/[^a-zA-Z0-9]/g, "").toLowerCase().slice(0, 12);
  return `${slug}${year}_${item.key.slice(0, 6)}`;
}

export function zoteroItemToBibtex(item: ZoteroApiItem, citekey: string): string {
  const type = item.itemType === "journalArticle" ? "article" : "misc";
  const fields: string[] = [];
  const add = (k: string, v?: string) => {
    if (v?.trim()) fields.push(`  ${k} = {${v.replace(/[{}]/g, "")}}`);
  };
  add("title", item.title);
  add("author", formatCreators(item.creators));
  add("year", extractYear(item.date));
  add("doi", item.DOI);
  add("url", item.url);
  add("abstract", item.abstractNote);
  if (item.extra) add("note", item.extra);
  return `@${type}{${citekey},\n${fields.join(",\n")}\n}`;
}

export function mapZoteroApiToSnapshot(
  apiItems: ZoteroApiItem[],
  apiCollections: ZoteroApiCollection[],
  apiTags: ZoteroApiTag[],
  userId: string,
  libraryVersion?: number
): {
  items: ZoteroItem[];
  notes: ZoteroNote[];
  attachments: ZoteroAttachment[];
  annotations: ZoteroAnnotation[];
  collections: ZoteroCollection[];
  tags: ZoteroTag[];
  bibliography: string;
} {
  const collections: ZoteroCollection[] = apiCollections.map((c) => ({
    key: c.data.key,
    name: c.data.name,
    parentCollection:
      typeof c.data.parentCollection === "string" ? c.data.parentCollection : undefined,
    itemCount: c.meta?.numItems ?? 0,
  }));

  const tags: ZoteroTag[] = apiTags.map((t) => ({ tag: t.tag, type: t.type }));

  const notes: ZoteroNote[] = [];
  const attachments: ZoteroAttachment[] = [];
  const annotations: ZoteroAnnotation[] = [];
  const topLevel: ZoteroApiItem[] = [];
  const childrenByParent = new Map<string, ZoteroApiItem[]>();

  for (const item of apiItems) {
    if (item.parentItem) {
      const list = childrenByParent.get(item.parentItem) ?? [];
      list.push(item);
      childrenByParent.set(item.parentItem, list);
    } else {
      topLevel.push(item);
    }
  }

  for (const item of apiItems) {
    if (item.itemType === "note" && item.parentItem && item.note) {
      notes.push({
        key: item.key,
        parentItemKey: item.parentItem,
        note: item.note,
        dateModified: item.date ?? "",
      });
    }
    if (item.itemType === "attachment" && item.parentItem) {
      const isPdf =
        item.contentType === "application/pdf" ||
        item.path?.toLowerCase().endsWith(".pdf") ||
        item.linkMode === "imported_file";
      attachments.push({
        key: item.key,
        parentItemKey: item.parentItem,
        title: item.title ?? "Attachment",
        contentType: item.contentType,
        path: item.path,
        linkMode: item.linkMode,
        hasPdf: Boolean(isPdf),
      });
    }
    if (item.itemType === "annotation" && item.parentItem) {
      const annType = (item.annotationType ?? "unknown") as ZoteroAnnotation["annotationType"];
      annotations.push({
        key: item.key,
        parentItemKey: item.parentItem,
        annotationType: annType === "highlight" || annType === "note" ? annType : "unknown",
        text: item.annotationText,
        comment: item.annotationComment,
        pageLabel: item.annotationPageLabel,
        color: item.annotationColor,
        dateModified: item.date ?? "",
        source: "zotero-web",
      });
    }
  }

  const items: ZoteroItem[] = topLevel
    .filter((i) => !["note", "attachment", "annotation"].includes(i.itemType))
    .map((item) => {
      const citekey = defaultCitekey(item);
      const kids = childrenByParent.get(item.key) ?? [];
      const attachmentKeys = kids.filter((k) => k.itemType === "attachment").map((k) => k.key);
      const noteKeys = kids.filter((k) => k.itemType === "note").map((k) => k.key);
      const annotationKeys = kids.filter((k) => k.itemType === "annotation").map((k) => k.key);
      const hasPdf = attachments.some((a) => a.parentItemKey === item.key && a.hasPdf);
      return {
        key: item.key,
        itemType: item.itemType,
        title: item.title ?? "Untitled",
        creators: formatCreators(item.creators),
        year: extractYear(item.date),
        doi: item.DOI,
        url: item.url,
        abstract: item.abstractNote,
        tags: (item.tags ?? []).map((t) => t.tag),
        collectionKeys: item.collections ?? [],
        citekey,
        bibtexRaw: zoteroItemToBibtex(item, citekey),
        dateModified: item.date ?? "",
        hasPdf,
        attachmentKeys,
        noteKeys,
        annotationKeys,
      };
    });

  const bibliography = items.map((i) => i.bibtexRaw).filter(Boolean).join("\n\n");

  return { items, notes, attachments, annotations, collections, tags, bibliography };
}
