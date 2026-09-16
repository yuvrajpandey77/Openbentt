/**
 * Phase 3 — Bounds (typed facade over knowledgeCore.mjs; enforced in
 * validation + stores, documented in OPENBENTT_ONTOLOGY.md).
 */
import { KNOWLEDGE_LIMITS as CORE } from "@/lib/knowledge/knowledgeCore.mjs";

export const KNOWLEDGE_LIMITS = CORE as {
  maxNameChars: 300;
  maxDescriptionChars: 2000;
  maxProperties: 32;
  maxPropertyKeyChars: 64;
  maxPropertyValueChars: 2000;
  maxAliases: 32;
  maxAliasChars: 300;
  maxIdentifiers: 32;
  maxIdentifierValueChars: 500;
  maxNamespaceChars: 32;
  maxTags: 32;
  maxTagChars: 64;
  maxQuoteChars: 600;
  maxTraversalDepth: 3;
  maxTraversalNodes: 500;
  maxPageSize: 100;
  maxEvidencePerSubject: 200;
};
