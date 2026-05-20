import type {
  ZoteroAnnotation,
  ZoteroAttachment,
  ZoteroCollection,
  ZoteroItem,
  ZoteroNote,
  ZoteroTag,
} from "@/types/zotero";
import {
  defaultCitekey,
  extractYear,
  formatCreators,
  mapZoteroApiToSnapshot as mapZoteroApiToSnapshotCore,
  parseCitationKeyFromExtra,
  zoteroItemToBibtex,
} from "@/lib/zotero/zoteroMapper.mjs";

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

export {
  defaultCitekey,
  extractYear,
  formatCreators,
  parseCitationKeyFromExtra,
  zoteroItemToBibtex,
};

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
  return mapZoteroApiToSnapshotCore(apiItems, apiCollections, apiTags, userId, {
    mode: "web",
    libraryVersion,
  }) as {
    items: ZoteroItem[];
    notes: ZoteroNote[];
    attachments: ZoteroAttachment[];
    annotations: ZoteroAnnotation[];
    collections: ZoteroCollection[];
    tags: ZoteroTag[];
    bibliography: string;
  };
}
