import type { ZoteroApiCollection, ZoteroApiItem, ZoteroApiTag } from "@/lib/zotero/zoteroWebApi";
import type { ZoteroLibrarySnapshot } from "@/types/zotero";
import { mapZoteroApiToSnapshot } from "@/lib/zotero/zoteroWebApi";

/** Mock Zotero Web API items for tests and offline demos. */
export const MOCK_ZOTERO_API_ITEMS: ZoteroApiItem[] = [
  {
    key: "ITEM1",
    version: 1,
    itemType: "journalArticle",
    title: "Attention Is All You Need",
    creators: [{ creatorType: "author", lastName: "Vaswani", firstName: "Ashish" }],
    date: "2017",
    DOI: "10.48550/arXiv.1706.03762",
    abstractNote: "We propose the Transformer architecture.",
    tags: [{ tag: "transformers" }, { tag: "nlp" }],
    collections: ["COL1"],
    extra: "Citation Key: vaswani2017attention",
  },
  {
    key: "ITEM2",
    version: 1,
    itemType: "journalArticle",
    title: "BERT: Pre-training of Deep Bidirectional Transformers",
    creators: [{ creatorType: "author", lastName: "Devlin", firstName: "Jacob" }],
    date: "2019",
    tags: [{ tag: "nlp" }, { tag: "pretraining" }],
    collections: ["COL1"],
  },
  {
    key: "ATT1",
    version: 1,
    itemType: "attachment",
    parentItem: "ITEM1",
    title: "Vaswani et al. - Attention.pdf",
    contentType: "application/pdf",
    linkMode: "imported_file",
  },
  {
    key: "ANN1",
    version: 1,
    itemType: "annotation",
    parentItem: "ATT1",
    annotationType: "highlight",
    annotationText: "Multi-head attention allows the model to jointly attend to information.",
    annotationComment: "Key mechanism for Transformers",
    annotationPageLabel: "5",
    date: "2024-01-15",
  },
  {
    key: "NOTE1",
    version: 1,
    itemType: "note",
    parentItem: "ITEM2",
    note: "<p>Important baseline for encoder-only models.</p>",
    date: "2024-02-01",
  },
];

export const MOCK_ZOTERO_COLLECTIONS: ZoteroApiCollection[] = [
  {
    key: "COL1",
    version: 1,
    data: { key: "COL1", name: "Deep Learning" },
    meta: { numItems: 2 },
  },
];

export const MOCK_ZOTERO_TAGS: ZoteroApiTag[] = [
  { tag: "nlp" },
  { tag: "transformers" },
  { tag: "pretraining" },
];

export const MOCK_BBT_BIB = `@article{vaswani2017attention,
  title = {Attention Is All You Need},
  author = {Vaswani, Ashish},
  year = {2017},
  doi = {10.48550/arXiv.1706.03762},
  citationKey = {vaswani2017attention}
}

@article{devlin2019bert,
  title = {BERT: Pre-training of Deep Bidirectional Transformers},
  author = {Devlin, Jacob},
  year = {2019},
  citationKey = {devlin2019bert}
}`;

export function buildMockZoteroSnapshot(): ZoteroLibrarySnapshot {
  const mapped = mapZoteroApiToSnapshot(
    MOCK_ZOTERO_API_ITEMS,
    MOCK_ZOTERO_COLLECTIONS,
    MOCK_ZOTERO_TAGS,
    "12345",
    42
  );
  return {
    syncedAt: new Date().toISOString(),
    mode: "web",
    userId: "12345",
    libraryVersion: 42,
    itemCount: mapped.items.length,
    warnings: [],
    ...mapped,
  };
}

/** In-memory fetch mock for Zotero Web API tests. */
export function createMockZoteroFetch(): typeof fetch {
  return async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/keys/current")) {
      return new Response(JSON.stringify({ userID: 12345, username: "mockuser" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("/collections")) {
      return new Response(JSON.stringify(MOCK_ZOTERO_COLLECTIONS), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("/tags")) {
      return new Response(JSON.stringify(MOCK_ZOTERO_TAGS), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("/items")) {
      const wrapped = MOCK_ZOTERO_API_ITEMS.map((data) => ({ data }));
      return new Response(JSON.stringify(wrapped), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Total-Results": String(MOCK_ZOTERO_API_ITEMS.length),
        },
      });
    }
    return new Response("Not found", { status: 404 });
  };
}
