/**
 * Phase 5 — Tool fixtures (deterministic seeds for unit + integration tests).
 */
import { knowledgeWebStore } from "@/lib/knowledge/webStore";
import { ingest, resetRegistryForTest } from "@/lib/documents/service";

export async function seedKnowledgeFixture(projectId = "proj_tools"): Promise<{ paperId: string; personId: string }> {
  const paper = knowledgeWebStore.upsertEntity({
    id: "ent_paper_tools01", type: "paper", canonicalName: "Tool Test Paper",
    normalizedName: "tool test paper", externalIds: [{ namespace: "doi", value: "10.1000/tool01" }],
    tags: ["tools"], origin: "document", projectId,
  });
  const person = knowledgeWebStore.upsertEntity({
    id: "ent_person_tools01", type: "person", canonicalName: "Ada Tester",
    normalizedName: "ada tester", origin: "document", projectId,
  });
  const rel = knowledgeWebStore.upsertRelationship({
    id: "rel_tools01", type: "AUTHORED_BY", subjectEntityId: person.id,
    objectEntityId: paper.id, origin: "document", projectId,
  });
  knowledgeWebStore.addEvidence({
    id: "ev_tools01", subjectType: "entity", subjectId: paper.id,
    evidenceType: "metadata", origin: "document", projectId,
    sourceRef: {
      documentId: "doc_tools01", chunkId: "doc_tools01:b0:0",
      sourceType: "text", title: "Tool Test Paper",
    },
  });
  knowledgeWebStore.addEvidence({
    id: "ev_tools02", subjectType: "relationship", subjectId: rel.id,
    evidenceType: "metadata", origin: "document", projectId,
    sourceRef: {
      documentId: "doc_tools01", chunkId: "doc_tools01:b0:0",
      sourceType: "text", title: "Tool Test Paper",
    },
  });
  return { paperId: paper.id, personId: person.id };
}

export async function seedDocumentFixture(projectId = "proj_tools"): Promise<string> {
  resetRegistryForTest();
  const { document } = await ingest({
    fileName: "tool-test.txt",
    mimeType: "text/plain",
    text: "Local-first workspaces keep research data on device. Tools wrap existing services deterministically.",
    projectId,
  });
  return document.id;
}

export function connectorImportFixture(projectId = "proj_tools") {
  return {
    connectorId: "crossref",
    externalId: "10.1000/toolimport",
    externalUrl: "https://doi.org/10.1000/toolimport",
    itemType: "journal-article",
    title: "Tool Import Paper",
    authors: ["Ada Tester"],
    organizations: [],
    venue: "Journal of Tools",
    publicationDate: "2026",
    identifiers: [{ namespace: "doi", value: "10.1000/toolimport" }],
    tags: [],
    collections: [],
    references: [],
    relatedItems: [],
    rawMetadata: {},
    retrievedAt: "2026-01-01T00:00:00.000Z",
    sourceVersion: "crossref-v1",
    projectId,
  };
}
