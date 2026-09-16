/**
 * Phase 4 — End-to-end fixture integration:
 * provider payload → normalize → identity → Paper/Person/Venue entities +
 * relationships + evidence → searchable knowledge → idempotent re-import →
 * changed-metadata update → malformed isolation.
 */
import { describe, expect, it } from "vitest";
import { crossrefNormalizeMessage } from "@/lib/connectors/crossrefConnector";
import { zoteroNormalizeApiItem } from "@/lib/connectors/zoteroConnector";
import { importExternalItems, type KnowledgeBackend } from "@/lib/connectors/connectorImport";
import type { Evidence, KnowledgeEntity, Relationship } from "@/lib/knowledge/types";
import {
  CROSSREF_MESSAGE_FIXTURE,
  ZOTERO_API_ITEM_FIXTURE,
} from "@/lib/connectors/connectorFixtures";

function knowledgeLikeBackend(): KnowledgeBackend & {
  entities: Map<string, KnowledgeEntity>;
  relationships: Map<string, Relationship>;
  evidence: Evidence[];
  hashes: Map<string, string>;
  search(q: string): KnowledgeEntity[];
} {
  const entities = new Map<string, KnowledgeEntity>();
  const relationships = new Map<string, Relationship>();
  const evidence: Evidence[] = [];
  const hashes = new Map<string, string>();
  return {
    entities, relationships, evidence, hashes,
    getEntity: (id: string) => entities.get(id) ?? null,
    upsertEntity: (e: Partial<KnowledgeEntity>) => {
      const full = e as KnowledgeEntity;
      entities.set(full.id, full);
      return full;
    },
    getRelationship: (id: string) => relationships.get(id) ?? null,
    upsertRelationship: (r: Partial<Relationship>) => {
      const full = r as Relationship;
      relationships.set(full.id, full);
      return full;
    },
    addEvidence: (e: Partial<Evidence>) => {
      const full = e as Evidence;
      evidence.push(full);
      return full;
    },
    getEvidenceFor: (t: "entity" | "relationship", id: string) =>
      evidence.filter((e) => e.subjectType === t && e.subjectId === id),
    search(q: string) {
      const needle = q.toLowerCase();
      return [...entities.values()].filter((e) =>
        e.canonicalName.toLowerCase().includes(needle) ||
        e.aliases.some((a) => a.toLowerCase().includes(needle)) ||
        e.externalIds.some((x) => `${x.namespace}:${x.value}`.toLowerCase().includes(needle)));
    },
  };
}

describe("connector integration (fixture → knowledge)", () => {
  it("imports crossref + zotero fixtures into searchable knowledge", async () => {
    const be = knowledgeLikeBackend();
    const hashes = { getHash: (c: string, e: string) => be.hashes.get(`${c}:${e}`), setHash: (c: string, e: string, h: string) => { be.hashes.set(`${c}:${e}`, h); } };
    const items = [
      crossrefNormalizeMessage(CROSSREF_MESSAGE_FIXTURE),
      zoteroNormalizeApiItem(ZOTERO_API_ITEM_FIXTURE),
    ];
    const res = await importExternalItems(items, be, { projectId: undefined }, hashes);
    expect(res.failed).toEqual([]);
    expect(res.created.length).toBe(2);

    // Paper + Person + Venue(+Organization) entities with relationships + evidence.
    const papers = [...be.entities.values()].filter((e) => e.type === "paper");
    expect(papers.length).toBe(2);
    expect([...be.entities.values()].filter((e) => e.type === "person").length).toBeGreaterThanOrEqual(4);
    expect(be.relationships.size).toBeGreaterThanOrEqual(6);

    // Searchable by title, author alias, and external identifier.
    expect(be.search("thermometry").length).toBe(1);
    expect(be.search("vaswani").length).toBeGreaterThanOrEqual(1);
    expect(be.search("doi:10.1038/nature12373").length).toBe(1);
    expect(be.search("zotero:ABCD1234").length).toBe(1);

    // Evidence chain: entity → sourceRef → connector source → external id + URL.
    for (const p of papers) {
      const ev = be.evidence.find((e) => e.subjectType === "entity" && e.subjectId === p.id);
      expect(ev).toBeDefined();
      const src = ev!.sourceRef as unknown as { connector?: { connectorId: string; externalId: string; url?: string; retrievedAt: string } };
      expect(src.connector?.connectorId).toBeTruthy();
      expect(src.connector?.externalId).toBeTruthy();
      expect(src.connector?.retrievedAt).toBeTruthy();
    }

    // Same fixtures again → unchanged, no duplicates, no evidence growth.
    const nE = be.entities.size;
    const nR = be.relationships.size;
    const nEv = be.evidence.length;
    const again = await importExternalItems(items, be, {}, hashes);
    expect(again.unchanged.length).toBe(2);
    expect(be.entities.size).toBe(nE);
    expect(be.relationships.size).toBe(nR);
    expect(be.evidence.length).toBe(nEv);

    // Changed metadata → external field updates, new evidence version.
    const changed = { ...CROSSREF_MESSAGE_FIXTURE, "container-title": ["Nature Physics"] };
    const upd = await importExternalItems(
      [{ ...crossrefNormalizeMessage(changed), retrievedAt: "2026-05-01T00:00:00.000Z" }],
      be, {}, hashes
    );
    expect(upd.updated.length).toBe(1);

    // Malformed sibling → isolated failure, others still import.
    const malformed = { connectorId: "crossref", externalId: "" } as never;
    const freshZotero = {
      ...ZOTERO_API_ITEM_FIXTURE,
      key: "NEWKEY01",
      data: { ...ZOTERO_API_ITEM_FIXTURE.data, key: "NEWKEY01", DOI: "10.9999/new-key-01" },
    };
    const partial = await importExternalItems(
      [malformed, zoteroNormalizeApiItem(freshZotero)],
      be, {}, hashes
    );
    expect(partial.failed.length).toBe(1);
    expect(partial.created.length).toBe(1);
  });
});
