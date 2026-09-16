import { beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { installLocalStorageMock } from "../../../test/helpers/localStorage";
import { knowledgeWebStore } from "@/lib/knowledge/webStore";
import { importKnowledge } from "@/lib/knowledge/exportImport";

/** Reproducible graph benchmark — real measured timings, printed, never fabricated. */
describe("knowledge benchmark", () => {
  beforeEach(() => {
    installLocalStorageMock();
    knowledgeWebStore.resetForTest();
  });

  it("measures insert/lookup/search/traversal on synthetic scales", () => {
    const rows: string[] = [];
    const fixture = JSON.parse(fs.readFileSync(path.join(process.cwd(), "test/fixtures/knowledge/synthetic-graph.json"), "utf8"));
    const data = importKnowledge(fixture);

    let t0 = performance.now();
    for (const e of data.entities) knowledgeWebStore.upsertEntity(e);
    for (const r of data.relationships) knowledgeWebStore.upsertRelationship(r);
    for (const ev of data.evidence) knowledgeWebStore.addEvidence(ev);
    rows.push(`seed 4 entities/3 rels: ${(performance.now() - t0).toFixed(1)}ms`);

    // Scale to 1000 entities + chain relationships.
    t0 = performance.now();
    for (let i = 0; i < 1000; i++) {
      knowledgeWebStore.upsertEntity({ id: `bench_e_${i}`, type: "concept", canonicalName: `Concept ${i}`, normalizedName: `concept ${i}` });
    }
    for (let i = 0; i < 999; i++) {
      knowledgeWebStore.upsertRelationship({ id: `bench_r_${i}`, type: "RELATED_TO", subjectEntityId: `bench_e_${i}`, objectEntityId: `bench_e_${i + 1}` });
    }
    rows.push(`insert 1000 entities + 999 rels: ${(performance.now() - t0).toFixed(1)}ms`);

    t0 = performance.now();
    const hit = knowledgeWebStore.searchEntities({ query: "concept 500" });
    rows.push(`entity lookup: ${(performance.now() - t0).toFixed(1)}ms (hits ${hit.length})`);
    expect(hit.length).toBeGreaterThan(0);

    t0 = performance.now();
    const alias = knowledgeWebStore.searchEntities({ query: "examplenet" });
    rows.push(`alias-adjacent lookup: ${(performance.now() - t0).toFixed(1)}ms (hits ${alias.length})`);

    for (const depth of [1, 2, 3] as const) {
      t0 = performance.now();
      const t = knowledgeWebStore.traverse("bench_e_500", { depth, limit: 500 });
      rows.push(`${depth}-hop traversal: ${(performance.now() - t0).toFixed(1)}ms (nodes ${t.nodes.length})`);
    }
    console.log(`[knowledge-bench]\n${rows.join("\n")}`);
  }, 60000);
});
