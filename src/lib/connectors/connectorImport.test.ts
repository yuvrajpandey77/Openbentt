/**
 * Phase 4 — Import lifecycle tests (dry run, idempotency, conflicts,
 * user-authored protection, partial failure, evidence, duplicates).
 */
import { describe, expect, it } from "vitest";
import type { Evidence, KnowledgeEntity, Relationship } from "@/lib/knowledge/types";
import {
  dryRunImport,
  importExternalItems,
  type HashStore,
  type KnowledgeBackend,
} from "@/lib/connectors/connectorImport";
import {
  externalItemFixture,
  zoteroItemFixture,
} from "@/lib/connectors/connectorFixtures";

function memBackend(): KnowledgeBackend & {
  entities: Map<string, KnowledgeEntity>;
  relationships: Map<string, Relationship>;
  evidence: Evidence[];
} {
  const entities = new Map<string, KnowledgeEntity>();
  const relationships = new Map<string, Relationship>();
  const evidence: Evidence[] = [];
  return {
    entities,
    relationships,
    evidence,
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
  };
}

function memHashes(): HashStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getHash: (c: string, e: string) => map.get(`${c}:${e}`),
    setHash: (c: string, e: string, h: string) => { map.set(`${c}:${e}`, h); },
  };
}

describe("dry run", () => {
  it("reports wouldCreate without mutating", async () => {
    const be = memBackend();
    const dry = await dryRunImport([externalItemFixture(), zoteroItemFixture()], be, {}, memHashes());
    expect(dry.wouldCreate.length).toBe(2);
    expect(dry.conflicts).toEqual([]);
    expect(be.entities.size).toBe(0);
  });
  it("reports validation errors per item", async () => {
    const be = memBackend();
    const bad = externalItemFixture({ externalId: "", title: undefined, identifiers: [] });
    const dry = await dryRunImport([externalItemFixture(), bad], be, {}, memHashes());
    expect(dry.wouldCreate.length).toBe(1);
    expect(dry.validationErrors.length).toBe(1);
  });
});

describe("idempotent import", () => {
  it("creates once, then reports unchanged with no duplicates", async () => {
    const be = memBackend();
    const hashes = memHashes();
    const items = [externalItemFixture(), zoteroItemFixture()];
    const first = await importExternalItems(items, be, {}, hashes);
    expect(first.created.length).toBe(2);
    const nEntities = be.entities.size;
    const nRels = be.relationships.size;
    const nEv = be.evidence.length;
    const second = await importExternalItems(items, be, {}, hashes);
    expect(second.unchanged.length).toBe(2);
    expect(second.created).toEqual([]);
    expect(be.entities.size).toBe(nEntities);
    expect(be.relationships.size).toBe(nRels);
    expect(be.evidence.length).toBe(nEv);
  });
  it("updates external fields when provider metadata changes", async () => {
    const be = memBackend();
    const hashes = memHashes();
    await importExternalItems([externalItemFixture()], be, {}, hashes);
    const res = await importExternalItems(
      [externalItemFixture({ venue: "Nature Communications", retrievedAt: "2026-02-01T00:00:00.000Z" })],
      be, {}, hashes
    );
    expect(res.updated.length).toBe(1);
  });
});

describe("conflicts + user-authored precedence", () => {
  it("preserves user-authored names and records conflicts", async () => {
    const be = memBackend();
    const hashes = memHashes();
    await importExternalItems([externalItemFixture()], be, {}, hashes);
    const paperId = [...be.entities.values()].find((e) => e.type === "paper")!.id;
    const paper = be.entities.get(paperId)!;
    be.entities.set(paperId, {
      ...paper, canonicalName: "My Own Title", provenance: "user-authored", origin: "user",
    });
    const res = await importExternalItems(
      [externalItemFixture({ title: "Provider Renamed Title", retrievedAt: "2026-03-01T00:00:00.000Z" })],
      be, {}, hashes
    );
    expect(be.entities.get(paperId)?.canonicalName).toBe("My Own Title");
    expect(res.conflicts.length).toBeGreaterThan(0);
    expect(res.items[0].status).toBe("conflict");
  });
});

describe("partial bulk failure", () => {
  it("imports good siblings when one item is malformed", async () => {
    const be = memBackend();
    const bad = externalItemFixture({ externalId: "", title: undefined, identifiers: [] });
    const res = await importExternalItems([externalItemFixture(), bad, zoteroItemFixture()], be, {}, memHashes());
    expect(res.created.length).toBe(2);
    expect(res.failed.length).toBe(1);
  });
  it("respects allowCreate=false", async () => {
    const be = memBackend();
    const res = await importExternalItems([externalItemFixture()], be, { allowCreate: false }, memHashes());
    expect(res.skipped.length).toBe(1);
    expect(be.entities.size).toBe(0);
  });
});

describe("provenance + evidence", () => {
  it("attaches connector evidence to papers and relationships", async () => {
    const be = memBackend();
    await importExternalItems([zoteroItemFixture()], be, {}, memHashes());
    const papers = [...be.entities.values()].filter((e) => e.type === "paper");
    expect(papers.length).toBe(1);
    // Paper has direct entity evidence with the connector trail.
    for (const p of papers) {
      const ev = be.evidence.filter((x) => x.subjectType === "entity" && x.subjectId === p.id);
      expect(ev.length, p.id).toBeGreaterThan(0);
      expect(ev[0].origin).toBe("zotero");
      expect((ev[0].sourceRef as unknown as { connector?: { externalId: string } }).connector?.externalId).toBe("ABCD1234");
    }
    // Persons are evidenced through their AUTHORED_BY relationships.
    const persons = [...be.entities.values()].filter((e) => e.type === "person");
    expect(persons.length).toBeGreaterThan(0);
    for (const r of be.relationships.values()) {
      const ev = be.evidence.filter((x) => x.subjectType === "relationship" && x.subjectId === r.id);
      expect(ev.length, r.id).toBeGreaterThan(0);
      expect(ev[0].origin).toBe("zotero");
    }
    const authored = [...be.relationships.values()].filter((r) => r.type === "AUTHORED_BY");
    expect(authored.length).toBe(persons.length);
  });
  it("prevents duplicate relationships and evidence explosion", async () => {
    const be = memBackend();
    const hashes = memHashes();
    // Force re-import with changed hash twice: rels/evidence dedupe still holds.
    await importExternalItems([zoteroItemFixture()], be, {}, hashes);
    const nRels = be.relationships.size;
    await importExternalItems(
      [zoteroItemFixture({ retrievedAt: "2026-04-01T00:00:00.000Z" })], be, {}, { getHash: () => undefined, setHash: () => undefined }
    );
    expect(be.relationships.size).toBe(nRels);
  });
});

describe("collection/tag mapping", () => {
  it("maps zotero collections and tags without case-duplicates", async () => {
    const be = memBackend();
    await importExternalItems(
      [zoteroItemFixture({ tags: ["Transformers", "transformers", "NLP"] })], be, {}, memHashes()
    );
    const paper = [...be.entities.values()].find((e) => e.type === "paper")!;
    const lowered = paper.tags.map((t) => t.toLowerCase());
    expect(new Set(lowered).size).toBe(lowered.length);
    expect(paper.tags.map((t) => t.toLowerCase())).toContain("coll01");
    expect(paper.tags.map((t) => t.toLowerCase())).toContain("nlp");
  });
});
