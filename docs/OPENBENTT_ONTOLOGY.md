# Openbentt Ontology Reference (Phase 3)

Canonical code: `src/lib/knowledge/` (renderer-safe core; registries owned by
`knowledgeCore.mjs`, shared with Electron), `electron/knowledgeStore.mjs`
(durable SQLite), `src/lib/knowledge/webStore.ts` (localStorage fallback).

## Entity types (implemented)

person, organization, paper, venue, method, dataset, metric, model,
technology, concept, location, event, product.

Each is an `EntityTypeDefinition{id,label,description}`; new types register
via `registerEntityType` (renderer) — future Company/ResearchLab/Benchmark/
Experiment/Hypothesis/Claim need no subsystem rewrite. Deferred: none blocked;
taxonomy stays small deliberately.

## Relationship types (implemented)

AUTHORED_BY, PUBLISHED_BY, PUBLISHED_IN, CITES, REFERENCES, USES_METHOD,
EVALUATED_ON, REPORTS_METRIC, PROPOSES, EXTENDS, REPRODUCES, BUILT_WITH,
USES, DEPENDS_ON, DERIVED_FROM, PART_OF, LOCATED_IN, RELATED_TO (only
symmetric type). All others are directed: subject —TYPE→ object.

## Identity rules

- Normalization (`normalizeName`: NFKC/trim/collapse/lowercase;
  `normalizePersonName`: "Doe, John"→"john doe"; `splitAuthorNames` for
  and/semicolon/comma lists) proposes **candidates only**.
- Stable ids: `ent_<type>_<fnv8>`; DOI-anchored papers `ent_paper_<fnv8>`.
- "Apple Inc." vs "Apple Records" normalize differently and never auto-merge;
  confirmation comes from shared external ids or explicit user merges.

## Aliases

Per-entity string lists (cap 32). Merges carry aliases forward to the
canonical entity. Aliases are searchable; they never merge on their own.

## External IDs

Namespaced pairs (`doi:…`, `orcid:…`, `arxiv:…`, `isbn:…`, `crossref:…`,
`zotero:…`, `citekey:…`, `url:…`; namespace regex `^[a-z][a-z0-9_]{0,31}$`).
Never invented: DOI/arXiv from source text, Zotero keys/citekeys from sync
data, Crossref values from API payloads. Identifier search is exact-match.

## Evidence

`{subjectType: entity|relationship, subjectId, predicate?, quote ≤600 chars,
evidenceType: document|metadata|citation|user|import, sourceRef (Phase 2
verbatim), evidenceDocVersion?, extractorVersion?, confidence, status,
origin}`. Quotes are bounded snippets, never document copies. Cap 200 per
subject. No relationship ships without evidence (extractors always pair them).

## Provenance

Evidence → SourceRef → `documentId / documentVersionId / page / section /
block / chunkId` → Phase 2 document/chunk. "Why does Openbentt believe this?"
is answered by `getEvidenceFor` + `listEvidenceForDocument`; UI shows
Document · Page · Section · quote.

## Confidence

`high|medium|low` = extraction confidence (ranking hint), orthogonal to
`status` (asserted|uncertain|deprecated|retracted), `evidence strength`
(quote + source count), and `source quality` (origin precedence). DOI/Zotero
sources default high; heuristics medium.

## Statuses

- Entity: active | unresolved (e.g. cited-by-DOI papers not yet imported) |
  deprecated | merged (redirects via `mergedInto`).
- Relationship: asserted | uncertain | deprecated | retracted.
- Evidence: current | stale (doc moved past `evidenceDocVersion`) | retracted.

## Merge semantics

FROM keeps its row (`status=merged`, `mergedInto`), a `knowledge_entity_merges`
record stores reason/timestamp/origin, aliases/identifiers/tags carry forward,
evidence rows are NOT rewritten (history traceable; `resolveEntity` redirects,
cycle-guarded). Nothing is hard-deleted.

## Stale semantics

Evidence records `evidenceDocVersion`. When the document advances,
`markEvidenceStaleForDocument` flips older `current` rows to `stale` — still
queryable, historically understandable, never presented as current-version
proof. Relationships are never auto-falsified.

## Origins + precedence

`user | document | zotero | crossref | import | system | future-llm`
(`future-llm` is an enum value only — no LLM runs in Phase 3). Precedence
user > zotero > crossref > filename > inferred mirrors in-repo behavior
(`mergeCrossrefIntoEntry` fill-missing; Phase 2 metadata ranks). Stores
enforce it: automatic reindexing never renames user-authored rows
(`provenance: automatic | user-authored | imported` tracked separately).

## Conflicts

Competing assertions coexist (Claim A + Evidence A, Claim B + Evidence B);
no overwrites. Separate Claim table deferred — Relationship + Evidence covers
current needs (ADR-6).
