/**
 * Phase 4 — Connector benchmark (real measured timings, printed, never fabricated).
 * Run: npx vitest run src/lib/connectors/benchmark.test.ts
 */
import { describe, expect, it } from "vitest";
import { crossrefNormalizeMessage } from "@/lib/connectors/crossrefConnector";
import { zoteroNormalizeApiItem } from "@/lib/connectors/zoteroConnector";
import { resolveIdentityForItem } from "@/lib/connectors/connectorIdentity";
import { importExternalItems, type KnowledgeBackend } from "@/lib/connectors/connectorImport";
import { itemHashFor } from "@/lib/connectors/connectorCore.mjs";
import type { Evidence, KnowledgeEntity, Relationship } from "@/lib/knowledge/types";
import type { ExternalItem } from "@/lib/connectors/connectorTypes";
import {
  CROSSREF_MESSAGE_FIXTURE,
  ZOTERO_API_ITEM_FIXTURE,
} from "@/lib/connectors/connectorFixtures";

function memBackend(): KnowledgeBackend & {
  entities: Map<string, KnowledgeEntity>;
  relationships: Map<string, Relationship>;
  evidence: Evidence[];
  hashes: Map<string, string>;
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
  };
}

function syntheticCrossref(i: number): ExternalItem {
  return crossrefNormalizeMessage(
    {
      DOI: `10.1000/bench${i}`,
      title: [`Benchmark paper number ${i} on connector throughput`],
      author: [{ given: "A.", family: `Author${i}` }, { given: "B.", family: `Coauthor${i}` }],
      issued: { "date-parts": [[2020 + (i % 6)]] },
      "container-title": [`Journal of Benchmarks ${i % 10}`],
      publisher: `Publisher ${i % 5}`,
      URL: `https://doi.org/10.1000/bench${i}`,
      type: "journal-article",
    },
    { retrievedAt: "2026-01-01T00:00:00.000Z" }
  );
}

describe("connector benchmark", () => {
  it("measures normalize/identity/import/lookup on synthetic scales", async () => {
    const rows: string[] = [];
    let t0 = performance.now();
    const items100: ExternalItem[] = [];
    for (let i = 0; i < 100; i++) items100.push(syntheticCrossref(i));
    rows.push(`normalize 100 crossref items: ${(performance.now() - t0).toFixed(1)}ms`);

    t0 = performance.now();
    for (let i = 0; i < 1000; i++) syntheticCrossref(1000 + i);
    rows.push(`normalize 1000 crossref items: ${(performance.now() - t0).toFixed(1)}ms`);

    t0 = performance.now();
    for (const it of items100) resolveIdentityForItem(it);
    rows.push(`identity resolution x100: ${(performance.now() - t0).toFixed(1)}ms`);

    t0 = performance.now();
    for (const it of items100) itemHashFor(it);
    rows.push(`item hashing x100: ${(performance.now() - t0).toFixed(1)}ms`);

    const be = memBackend();
    const hashes = {
      getHash: (c: string, e: string) => be.hashes.get(`${c}:${e}`),
      setHash: (c: string, e: string, h: string) => { be.hashes.set(`${c}:${e}`, h); },
    };
    t0 = performance.now();
    const r100 = await importExternalItems(items100, be, {}, hashes);
    rows.push(`import 100 items: ${(performance.now() - t0).toFixed(1)}ms (created ${r100.created.length}, entities ${be.entities.size}, rels ${be.relationships.size}, ev ${be.evidence.length})`);
    expect(r100.failed).toEqual([]);

    t0 = performance.now();
    const dup = await importExternalItems(items100, be, {}, hashes);
    rows.push(`duplicate import x100: ${(performance.now() - t0).toFixed(1)}ms (unchanged ${dup.unchanged.length})`);
    expect(dup.unchanged.length).toBe(100);

    const items1000: ExternalItem[] = [];
    for (let i = 0; i < 1000; i++) items1000.push(syntheticCrossref(10000 + i));
    t0 = performance.now();
    let created1000 = 0;
    // Bulk imports are deterministically batched at 200 items per call.
    for (let b = 0; b < 5; b++) {
      const r = await importExternalItems(items1000.slice(b * 200, b * 200 + 200), be, {}, hashes);
      created1000 += r.created.length;
      expect(r.failed).toEqual([]);
    }
    rows.push(`import 1000 items (5x200 batches): ${(performance.now() - t0).toFixed(1)}ms (created ${created1000}, entities ${be.entities.size})`);
    expect(created1000).toBe(1000);

    t0 = performance.now();
    const needle = "benchmark paper number 42";
    const hits = [...be.entities.values()].filter((e) => e.canonicalName.toLowerCase().includes(needle));
    rows.push(`search after import: ${(performance.now() - t0).toFixed(1)}ms (hits ${hits.length})`);
    expect(hits.length).toBeGreaterThan(0);

    t0 = performance.now();
    let evCount = 0;
    for (const e of [...be.entities.values()].slice(0, 100)) {
      evCount += (await be.getEvidenceFor("entity", e.id)).length;
    }
    rows.push(`evidence lookup x100 subjects: ${(performance.now() - t0).toFixed(1)}ms (rows ${evCount})`);

    t0 = performance.now();
    let idHits = 0;
    for (const e of be.entities.values()) {
      if (e.externalIds.some((x) => x.namespace === "doi")) idHits++;
    }
    rows.push(`external ID scan (${be.entities.size} entities): ${(performance.now() - t0).toFixed(1)}ms (doi ${idHits})`);

    // Fixture sanity: zotero path normalizes in budget too.
    t0 = performance.now();
    for (let i = 0; i < 100; i++) zoteroNormalizeApiItem(ZOTERO_API_ITEM_FIXTURE);
    rows.push(`normalize zotero fixture x100: ${(performance.now() - t0).toFixed(1)}ms`);
    void CROSSREF_MESSAGE_FIXTURE;

    console.log(`[connector-bench]\n${rows.join("\n")}`);
  }, 120000);
});
