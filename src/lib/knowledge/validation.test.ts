import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/appError";
import {
  validateEntity, validateRelationship, validateEvidence, validateTraversal,
} from "@/lib/knowledge/validation";

const ref = {
  documentId: "doc_abc123", documentVersionId: "doc_abc123@v1",
  page: 4, section: "s1", block: "b2", chunkId: "doc_abc123:b2:0",
  sourceType: "pdf", title: "Paper",
};

function expectInvalid(fn: () => unknown, what: string): void {
  try {
    fn();
  } catch (err) {
    expect(err, what).toBeInstanceOf(AppError);
    expect((err as AppError).code, what).toBe("validation");
    return;
  }
  throw new Error(`expected validation failure: ${what}`);
}

describe("knowledge validation", () => {
  it("accepts a well-formed entity", () => {
    const e = validateEntity({
      id: "ent_paper_1234abcd", type: "paper", canonicalName: "T", normalizedName: "t",
      aliases: ["Alt"], externalIds: [{ namespace: "doi", value: "10.1/x" }], tags: ["nlp"],
      properties: { year: "2024" },
    });
    expect(e.status).toBe("active");
  });

  it("rejects unknown types, bad ids, oversized properties", () => {
    expectInvalid(() => validateEntity({ id: "x", type: "nope", canonicalName: "a", normalizedName: "a" }), "type");
    expectInvalid(() => validateEntity({ id: "bad id!", type: "paper", canonicalName: "a", normalizedName: "a" }), "id");
    expectInvalid(() => validateEntity({
      id: "x", type: "paper", canonicalName: "a", normalizedName: "a",
      properties: Object.fromEntries(Array.from({ length: 33 }, (_, i) => [`k${i}`, "v"])),
    }), "props");
    expectInvalid(() => validateEntity({
      id: "x", type: "paper", canonicalName: "a", normalizedName: "a",
      aliases: Array.from({ length: 33 }, (_, i) => `a${i}`),
    }), "aliases");
    expectInvalid(() => validateEntity({
      id: "x", type: "paper", canonicalName: "a", normalizedName: "a",
      externalIds: [{ namespace: "BAD NS", value: "v" }],
    }), "namespace");
  });

  it("rejects SQL-injection-shaped ids and self-relationships", () => {
    expectInvalid(() => validateEntity({ id: "x'; DROP TABLE knowledge_entities;--", type: "paper", canonicalName: "a", normalizedName: "a" }), "sqli");
    expectInvalid(() => validateRelationship({
      id: "r1", type: "CITES", subjectEntityId: "a", objectEntityId: "a",
    }), "self");
    expectInvalid(() => validateRelationship({ id: "r1", type: "HUGS", subjectEntityId: "a", objectEntityId: "b" }), "reltype");
  });

  it("evidence requires valid SourceRef and bounded quotes", () => {
    const ok = validateEvidence({ id: "e1", subjectType: "relationship", subjectId: "r1", sourceRef: ref, quote: "short" });
    expect(ok.status).toBe("current");
    expectInvalid(() => validateEvidence({ id: "e1", subjectType: "relationship", subjectId: "r1", sourceRef: {} }), "source");
    expectInvalid(() => validateEvidence({
      id: "e1", subjectType: "relationship", subjectId: "r1", sourceRef: ref, quote: "x".repeat(601),
    }), "quote");
    expectInvalid(() => validateEvidence({
      id: "e1", subjectType: "relationship", subjectId: "r1",
      sourceRef: { ...ref, documentId: "../../etc/passwd" },
    }), "traversal");
  });

  it("traversal is bounded", () => {
    expect(validateTraversal("ent_x", 2, 50)).toEqual({ id: "ent_x", depth: 2, limit: 50 });
    expectInvalid(() => validateTraversal("ent_x", 99, 50), "depth");
    expectInvalid(() => validateTraversal("ent_x", 1, 100000), "limit");
    expectInvalid(() => validateTraversal("x';--", 1, 10), "id");
  });
});
