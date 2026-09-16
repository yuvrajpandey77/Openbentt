/**
 * Phase 4 — Connector fixtures (realistic synthetic provider payloads).
 * No live APIs; deterministic inputs for unit + integration tests.
 */
import type { ExternalItem } from "@/lib/connectors/connectorTypes";

export const CROSSREF_MESSAGE_FIXTURE = {
  DOI: "10.1038/nature12373",
  title: ["Nanometre-scale thermometry in a living cell"],
  author: [
    { given: "G.", family: "Kucsko" },
    { given: "P. C.", family: "Maurer" },
    { name: "The NV-Diamond Collaboration" },
  ],
  issued: { "date-parts": [[2013, 8, 1]] },
  "container-title": ["Nature"],
  publisher: "Springer Science and Business Media LLC",
  URL: "https://doi.org/10.1038/nature12373",
  type: "journal-article",
  ISSN: ["0028-0836"],
};

export const CROSSREF_MESSAGE_MINIMAL = {
  DOI: "10.1000/xyz123",
  title: ["A Minimal Record"],
};

export const CROSSREF_MESSAGE_MALFORMED = {
  DOI: "not-a-doi",
  title: [12345],
  author: "definitely not an array",
};

export const ZOTERO_API_ITEM_FIXTURE = {
  key: "ABCD1234",
  data: {
    key: "ABCD1234",
    itemType: "journalArticle",
    title: "Attention Is All You Need",
    creators: [
      { firstName: "Ashish", lastName: "Vaswani" },
      { firstName: "Noam", lastName: "Shazeer" },
    ],
    date: "2017-06-12",
    DOI: "10.48550/arXiv.1706.03762",
    url: "https://arxiv.org/abs/1706.03762",
    collections: ["COLL01"],
    tags: [{ tag: "transformers" }, { tag: "Attention" }],
    publisher: "NeurIPS",
    publicationTitle: "Advances in Neural Information Processing Systems",
    abstractNote: "We propose a new network architecture, the Transformer.",
  },
};

export function externalItemFixture(overrides?: Partial<ExternalItem>): ExternalItem {
  return {
    connectorId: "crossref",
    externalId: "10.1038/nature12373",
    externalUrl: "https://doi.org/10.1038/nature12373",
    itemType: "paper",
    title: "Nanometre-scale thermometry in a living cell",
    authors: ["G. Kucsko", "P. C. Maurer"],
    organizations: [],
    venue: "Nature",
    publicationDate: "2013",
    abstract: "Abstract text.",
    identifiers: [
      { namespace: "doi", value: "10.1038/nature12373" },
      { namespace: "crossref", value: "10.1038/nature12373" },
    ],
    tags: [],
    collections: [],
    references: [],
    relatedItems: [],
    rawMetadata: { publisher: "Springer" },
    retrievedAt: "2026-01-01T00:00:00.000Z",
    sourceVersion: "crossref-v1",
    ...overrides,
  };
}

export function zoteroItemFixture(overrides?: Partial<ExternalItem>): ExternalItem {
  return {
    connectorId: "zotero",
    externalId: "ABCD1234",
    externalUrl: "https://arxiv.org/abs/1706.03762",
    itemType: "paper",
    title: "Attention Is All You Need",
    authors: ["Ashish Vaswani", "Noam Shazeer"],
    organizations: [],
    venue: "Advances in Neural Information Processing Systems",
    publicationDate: "2017",
    abstract: "We propose a new network architecture, the Transformer.",
    identifiers: [
      { namespace: "zotero", value: "ABCD1234" },
      { namespace: "doi", value: "10.48550/arxiv.1706.03762" },
    ],
    tags: ["transformers"],
    collections: ["COLL01"],
    references: [],
    relatedItems: [],
    rawMetadata: {},
    retrievedAt: "2026-01-01T00:00:00.000Z",
    sourceVersion: "zotero-v1",
    ...overrides,
  };
}
