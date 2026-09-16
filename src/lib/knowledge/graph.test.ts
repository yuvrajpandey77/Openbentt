import { beforeEach, describe, expect, it } from "vitest";
import { installLocalStorageMock } from "../../../test/helpers/localStorage";
import { boundedTraverse } from "@/lib/knowledge/traversal";
import { isEvidenceStale, versionIntFromId } from "@/lib/knowledge/stale";
import { exportKnowledge, importKnowledge } from "@/lib/knowledge/exportImport";
import { knowledgeWebStore } from "@/lib/knowledge/webStore";

describe("graph traversal core", () => {
  const edges = [
    { id: "r1", type: "AUTHORED_BY", subject: "personA", object: "paperC", status: "asserted" },
    { id: "r2", type: "PUBLISHED_BY", subject: "paperC", object: "orgB", status: "asserted" },
    { id: "r3", type: "USES", subject: "paperC", object: "techD", status: "asserted" },
    // Cycle: C → A → C must terminate.
    { id: "r4", type: "RELATED_TO", subject: "paperC", object: "personA", status: "asserted" },
    { id: "r5", type: "CITES", subject: "paperC", object: "paperX", status: "retracted" },
  ];
  it("depth-1 stays local; depth-2 reaches org/tech", () => {
    expect(boundedTraverse("paperC", edges, { depth: 1 }).nodes.sort())
      .toEqual(["paperC", "personA", "orgB", "techD"].sort());
    const d2 = boundedTraverse("personA", edges, { depth: 2 });
    expect(d2.nodes).toContain("orgB");
    // Retracted edges are not followed.
    expect(d2.nodes).not.toContain("paperX");
  });
  it("cycles terminate and limits bind", () => {
    const cyclic = [
      { id: "a", type: "USES", subject: "A", object: "B", status: "asserted" },
      { id: "b", type: "USES", subject: "B", object: "C", status: "asserted" },
      { id: "c", type: "USES", subject: "C", object: "A", status: "asserted" },
    ];
    const r = boundedTraverse("A", cyclic, { depth: 3, limit: 500 });
    expect(r.nodes.sort()).toEqual(["A", "B", "C"]);
    const capped = boundedTraverse("A", cyclic, { depth: 3, limit: 2 });
    expect(capped.nodes).toHaveLength(2);
  });
  it("depth hard cap enforced", () => {
    const chain = Array.from({ length: 10 }, (_, i) => ({
      id: `e${i}`, type: "USES", subject: `n${i}`, object: `n${i + 1}`, status: "asserted",
    }));
    expect(boundedTraverse("n0", chain, { depth: 99 }).nodes.length).toBeLessThanOrEqual(4);
  });
});

describe("stale semantics", () => {
  it("v1 evidence vs v2 document is stale; unrelated versions are not", () => {
    expect(versionIntFromId("doc_ab12@v3")).toBe(3);
    expect(versionIntFromId("nope")).toBeUndefined();
    expect(isEvidenceStale({ evidenceDocVersion: 1, status: "current" }, 2)).toBe(true);
    expect(isEvidenceStale({ evidenceDocVersion: 2, status: "current" }, 2)).toBe(false);
    expect(isEvidenceStale({ evidenceDocVersion: 1, status: "retracted" }, 2)).toBe(false);
    expect(isEvidenceStale({ status: "current" }, 2)).toBe(false);
  });
});

describe("export/import round-trip", () => {
  it("preserves ids/provenance/status; rejects bad payloads", () => {
    const doc = exportKnowledge({
      entities: [{ id: "ent_person_1", type: "person", canonicalName: "A", normalizedName: "a", status: "active", properties: {}, aliases: [], externalIds: [], tags: [], origin: "user", provenance: "user-authored", createdAt: "t", updatedAt: "t" }],
      relationships: [], evidence: [],
    });
    expect(doc.format).toBe("openbentt-knowledge-v1");
    const back = importKnowledge(JSON.parse(JSON.stringify(doc)));
    expect(back.entities[0].provenance).toBe("user-authored");
    expect(() => importKnowledge({ format: "nope" })).toThrow();
    expect(() => importKnowledge({ format: "openbentt-knowledge-v1", entities: [{ id: "bad id!" }], relationships: [], evidence: [] })).toThrow();
  });
});

describe("web store behavior", () => {
  let mock: ReturnType<typeof installLocalStorageMock>;
  beforeEach(() => {
    mock = installLocalStorageMock();
    knowledgeWebStore.resetForTest();
  });

  it("merge preserves history + redirects + evidence", () => {
    knowledgeWebStore.upsertEntity({ id: "a", type: "organization", canonicalName: "OpenAI", normalizedName: "openai" });
    knowledgeWebStore.upsertEntity({ id: "b", type: "organization", canonicalName: "Open AI", normalizedName: "open ai", aliases: ["OpenAI Inc."] });
    knowledgeWebStore.addEvidence({
      id: "ev1", subjectType: "entity", subjectId: "b",
      sourceRef: { documentId: "doc_1", chunkId: "doc_1:b0:0", sourceType: "unknown" },
    });
    const m = knowledgeWebStore.mergeEntities("b", "a", "same company", "user");
    expect(m.from.status).toBe("merged");
    expect(m.from.mergedInto).toBe("a");
    expect(m.into.aliases).toContain("OpenAI Inc.");
    // Evidence on the old id still traceable; resolve redirects.
    expect(knowledgeWebStore.getEvidenceFor("entity", "b")).toHaveLength(1);
    expect(knowledgeWebStore.resolveEntity("b")?.id).toBe("a");
    expect(knowledgeWebStore.listMerges("b")).toHaveLength(1);
  });

  it("user-authored names survive automatic reindex", () => {
    knowledgeWebStore.upsertEntity({ id: "u1", type: "concept", canonicalName: "My Term", normalizedName: "my term", origin: "user", provenance: "user-authored" });
    knowledgeWebStore.upsertEntity({ id: "u1", type: "concept", canonicalName: "auto term", normalizedName: "auto term", origin: "document", provenance: "automatic" });
    expect(knowledgeWebStore.getEntity("u1")?.canonicalName).toBe("My Term");
  });

  it("stale marking is version-scoped", () => {
    knowledgeWebStore.upsertEntity({ id: "e1", type: "paper", canonicalName: "P", normalizedName: "p" });
    knowledgeWebStore.addEvidence({
      id: "ev1", subjectType: "entity", subjectId: "e1",
      sourceRef: { documentId: "doc_1", chunkId: "c", sourceType: "unknown" }, evidenceDocVersion: 1,
    });
    expect(knowledgeWebStore.markEvidenceStaleForDocument("doc_1", 1)).toEqual({ marked: 0 });
    expect(knowledgeWebStore.markEvidenceStaleForDocument("doc_1", 2)).toEqual({ marked: 1 });
    expect(knowledgeWebStore.getEvidenceFor("entity", "e1")[0].status).toBe("stale");
  });
});
