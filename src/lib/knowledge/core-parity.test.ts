import { describe, expect, it } from "vitest";
import {
  ENTITY_TYPE_IDS, RELATIONSHIP_TYPE_IDS, SYMMETRIC_RELATIONSHIP_IDS,
  KNOWLEDGE_LIMITS, entityIdFor, normalizeDoi, normalizeName,
  normalizePersonName, paperIdForDoi, splitAuthorNames,
} from "@/lib/knowledge/knowledgeCore.mjs";
import { ENTITY_TYPES } from "@/lib/knowledge/entityTypes";
import { RELATIONSHIP_TYPES } from "@/lib/knowledge/relationshipTypes";
import { KNOWLEDGE_LIMITS as TSLimits } from "@/lib/knowledge/limits";
import * as normalize from "@/lib/knowledge/normalize";
import * as identity from "@/lib/knowledge/identity";

/** TS facades must never diverge from the Electron-shared core. */
describe("knowledge core parity (renderer TS ↔ shared .mjs)", () => {
  it("entity registry matches", () => {
    expect(ENTITY_TYPES.map((t) => t.id)).toEqual(ENTITY_TYPE_IDS);
  });
  it("relationship registry matches", () => {
    expect(RELATIONSHIP_TYPES.map((t) => t.id)).toEqual(RELATIONSHIP_TYPE_IDS);
    expect(RELATIONSHIP_TYPES.filter((t) => t.symmetric).map((t) => t.id))
      .toEqual(SYMMETRIC_RELATIONSHIP_IDS);
  });
  it("limits match", () => {
    expect({ ...TSLimits }).toEqual({ ...KNOWLEDGE_LIMITS });
  });
  it("normalize/identity facades delegate identically", () => {
    expect(normalize.normalizeName("  OpenAI\t")).toBe(normalizeName("  OpenAI\t"));
    expect(normalize.normalizePersonName("Doe, John")).toBe(normalizePersonName("Doe, John"));
    expect(normalize.splitAuthorNames("A and B; C")).toEqual(splitAuthorNames("A and B; C"));
    expect(normalize.normalizeDoi("https://doi.org/10.1/ABC.")).toBe(normalizeDoi("https://doi.org/10.1/ABC."));
    expect(identity.entityIdFor("paper", "x")).toBe(entityIdFor("paper", "x"));
    expect(identity.paperIdForDoi("10.1/x")).toBe(paperIdForDoi("10.1/x"));
  });
});
