# Openbentt Phase 4 — Connector Architecture

Local-first, provenance-first, deterministic external knowledge ingestion.
No agents/MCP/auth/cloud/graph or vector DB. No LLM calls in ingestion.

## 1. Connector architecture

```
External Provider (Crossref / Zotero)
        |
        v
Connector Adapter (crossrefConnector.ts / zoteroConnector.ts)
  - bounded SSRF-safe fetch, capability gate, deterministic normalize
        |
        v
Normalized ExternalItem (connectorNormalize.ts)
  - sanitized, capped, credential-free
        |
        v
Identity Resolution (connectorIdentity.ts over Phase 3 identity)
  - DOI → namespaced provider id → deterministic metadata
        |
        v
Knowledge Mapping (connectorImport.ts via extractFromCrossref/Zotero)
  - Paper / Person / Organization / Venue + AUTHORED_BY / PUBLISHED_IN / PUBLISHED_BY
        |
        v
Evidence + Provenance (connectorEvidence.ts, Phase 2 SourceRef verbatim)
        |
        v
Local Knowledge Store (knowledgeStore.mjs / knowledgeWebStore)
        |
        v
Sync / Import Result (created|updated|unchanged|skipped|conflict|failed)
```

Layers: `src/lib/connectors/connectorCore.mjs` is the shared SSOT (plain JS,
imported by both renderer TS and Electron `.mjs`, mirroring the
`knowledgeCore.mjs` precedent). TS facades add types + orchestration;
`electron/connectorStore.mjs` adds durable SQLite execution.

## 2. Connector contract

`ConnectorDefinition` (`connectorTypes.ts`, enforced by `connectorRegistry.ts`):

- `id` (`crossref` | `zotero`; static registry, unknown ids rejected)
- `name`, `version` (`1.0.0`), `sourceType`, `authMode` (`none` | `api-key`)
- `capabilities` (declared subset of the 11 known capabilities)
- `supportedEntityTypes`, `supportedOperations`, `rateLimitNote`

Provider logic lives behind `crossrefFetchItem` / `crossrefSearch` /
`zoteroFetchLibrary` / `zoteroFetchItem` plus offline
`crossrefNormalizeMessage` / `zoteroNormalizeApiItem` (fixtures/tests).

## 3. Capability model

Known: `DISCOVER FETCH_ITEM FETCH_COLLECTION SEARCH IMPORT SYNC CITATIONS
AUTHORS FULL_TEXT METADATA IDENTIFIERS`.

- Crossref: `SEARCH FETCH_ITEM METADATA AUTHORS IDENTIFIERS`
  (`CITATIONS` deliberately NOT claimed — the provider returns no references).
- Zotero: `FETCH_COLLECTION FETCH_ITEM METADATA AUTHORS IDENTIFIERS IMPORT`.

`requireCapability()` runs before execution; unknown capabilities fail closed
(`unsupported_capability`). The UI only exposes declared operations.

## 4. Normalized item model

`ExternalItem`: `connectorId externalId externalUrl? itemType title?
authors[] organizations[] venue? publicationDate? abstract? identifiers[]
tags[] collections[] references[] relatedItems[] rawMetadata retrievedAt
sourceVersion?`.

Bounds (`CONNECTOR_LIMITS` in `connectorCore.mjs`): title 1k, abstract 10k,
64 authors, 64 tags/collections, 32 identifiers, 100 refs, 20k raw metadata,
2k URL, 200 items/import, 64 rels/evidence per item, 15s fetch timeout, 2MB
response cap, 3 redirects. Raw metadata is sanitized and credential keys are
stripped; never executed; never rendered as HTML.

## 5. Identity resolution

Priority (no Phase 3 algorithm changes — reuse only):

1. DOI (`doi:<normalized>`, `paperIdForDoi`) — Crossref + Zotero-with-DOI.
2. Stable provider id (`zotero:<key>`, `crossref:<id>`).
3. Deterministic metadata fallback (`ent_paper_<fnv8(type:name)>`).
4. `null` when neither title nor DOI exists (item rejected, sibling-safe).

External identifiers stay namespaced on the entity (`doi:`, `zotero:`,
`crossref:`, `citekey:`, `issn:`). Re-import resolves to the same entity id;
no duplicates.

## 6. Provenance

Every connector-created entity/relationship gets Evidence:

```
Knowledge Entity / Relationship → Evidence → SourceRef → connector source
→ external id → external URL + retrievedAt + provider version
```

`SourceRef` is reused verbatim (`documentId: connector_<id>`,
`chunkId: cc_<connector>_<fnv8>` — both `ID_RE`-safe and slash-free).
Connector provenance rides as an additive optional `connector:
{ connectorId externalId url? retrievedAt providerVersion? }` key inside the
persisted `source_json`; old readers and both validators ignore unknown keys,
so Phase 2/3 compatibility is preserved with zero migration of old rows.
Historical evidence is never mutated; provider-version marker evidence is
added per import for staleness tracking.

## 7. Crossref flow

`crossrefFetchItem(doi)` / `crossrefSearch(query)`: capability gate → HTTPS +
SSRF-validated URL → bounded fetch (manual redirects with per-hop
revalidation, JSON content-type, 2MB cap) → depth/size guard →
`normalizeCrossrefWork` (DOI/title/authors/journal/year/publisher/URL/ISSN) →
`ExternalItem`. Failures map to typed `ConnectorError`s (auth/rate-limit/
timeout/SSRF/too-large/invalid-response). No API key; polite-pool UA.

## 8. Zotero flow

`zoteroFetchLibrary(userId, apiKey)` / `zoteroFetchItem(...)`: capability gate
→ paged `api.zotero.org` fetch (key in `Zotero-API-Key` header only, never
persisted into items) → `zoteroApiItemToRaw` (key/title/creators/year/DOI/URL/
collections/tags/publisher/venue/abstract) → `ExternalItem`. Attachments and
notes are excluded from fetch (`itemType=-attachment,-note`); attachments are
never downloaded — an explicit future import path can route full text through
Phase 2 `DocumentService`. Credentials use the existing
`zoteroSecretStore.mjs` vault; renderer memory-only on web.

## 9. Import lifecycle

`importExternalItems(items, backend, opts, hashes)` (renderer/web/tests) and
`importConnectorItems(app, items, opts)` (Electron, same rules):

1. Shape validation (`validateExternalItem` / `validateItemShape`).
2. Identity resolution → deterministic entity id.
3. Mapping via existing `extractFromCrossref` / `extractFromZotero`
   (Paper + Person + Venue/Organization, only asserted relations).
4. Merge: create missing; enrich external-managed fields; fill-missing
   properties; union aliases/tags/externalIds (case-insensitive tag union).
5. Relationships deduped by id; evidence deduped by
   chunk + type + quote; provider marker evidence versioned per import.
6. Hash stored (`connector_items` / web fallback); link stored
   (`connector_item_links`); sync run recorded with counts.
7. Per-item try/catch: one failure → `failed` entry, siblings continue.
   Writes order entities → relationships → evidence (no dangling references;
   orphan entities are valid standalone rows).

Defaults: `allowCreate allowUpdate preserveUserData createEvidence
createRelationships` all true; `dryRun` false. 200-item cap per call;
larger syncs use deterministic batches.

## 10. Dry run

`dryRunImport` / `dryRunConnectorImport`: validation + normalization +
identity + hash compare + conflict detection, zero persistent mutation.
Returns `wouldCreate wouldUpdate wouldSkip conflicts validationErrors`.

## 11. Conflict handling

User-authored (`provenance=user-authored`, i.e. `origin=user`) names and
descriptions are never overwritten: the external value is kept as provider
evidence and a conflict entry
`{ connectorId externalId entityId field localValue externalValue }` is
returned with item status `conflict`. No Claim system, no truth adjudication
(Phase 5+ concern). Note: Phase 3 pins `provenance` at entity creation, so
protection applies to entities that originated as user-authored; connector-
imported rows later edited by the user keep `automatic` provenance (known
limitation, §24 of completion report).

## 12. Sync state

`never_synced → syncing → synced | partial | failed` (`connectorSync.ts`;
illegal transitions throw). Persisted per connector+scope in
`connector_sync_runs` (latest 200 kept) with counts + sanitized error.
Missing external records are marked `not_seen`/stale in `connector_items` —
never deleted, and deletion never cascades to entities/relationships/evidence.

## 13. Security

- Hostile metadata: sanitize + cap every string/array; JSON depth (8) and
  breadth (500 keys / 2000 array) guards; `assertBoundedProviderJson`.
- Network: reuse of the Phase 2 SSRF policy (HTTPS-only, no creds, private/
  link-local/metadata-host blocklist, per-hop redirect revalidation);
  `fetchConnectorJson` adds header allowlisting (drops auth-ish headers from
  caller-supplied maps) and JSON content-type enforcement.
- Storage: parameterized SQL only; `safeError()` redacts credential shapes;
  sync state never stores secrets; raw payloads never stored.
- Rendering: external strings are plain text; no HTML execution path.
- Rate limits: 429 → typed `rate_limited`, no aggressive retries (Zotero:
  single bounded retry budget documented for future use; not implemented).

## 14. Persistence

SQLite v9 (additive `migrateV9`): `connector_sources`, `connector_items`
(hash + `seen|stale|not_seen` + timestamps), `connector_sync_runs`,
`connector_item_links` (FK → `knowledge_entities`, cascade on entity delete
only). Parameterized SQL, indexes on connector/seen/entity. Web fallback:
bounded `localStorage` (`openbentt-connectors-fallback-v1`: 5k items, 200
runs, 10k links), explicitly non-durable across the Electron/web boundary.

## 15. IPC

Single channel `research:connectors` on the existing `openbenttResearch`
bridge with op allowlist:
`list get capabilities preview dryRun import syncStatus sync syncRuns
entityFor disconnect reset`. Unknown ops/connectors rejected. Payloads are
normalized items only (no arbitrary URLs/paths/SQL). Preload adds one method
`connectors(op, payload)` — `ipcRenderer` stays hidden.

## 16. UI

`src/components/knowledge/ConnectorPanel.tsx` mounted at the bottom of
`KnowledgeSearchPanel`: connector name/status/capabilities/last sync, DOI
lookup via the Crossref boundary, staged-item provenance display, Dry run and
Import with create/update/unchanged/conflict/failed counts. Connector-created
entities are discoverable in the existing `KnowledgeSearchPanel`/`EntityPanel`
/`RelationshipList`/`EvidenceList` (external ids, provider evidence with
retrieval time) — no separate graph UI.

## 17. Testing

- `connectors.test.ts` (27): registry, capabilities, normalization,
  identifiers, hashing, SSRF, bounded fetch, errors, redaction, provenance,
  sync machine.
- `connectorImport.test.ts` (10): dry run, idempotency, user conflicts,
  partial failure, `allowCreate=false`, evidence scope, rel/evidence dedupe,
  tag folding.
- `connectorIntegration.test.ts` (1): fixture → searchable knowledge →
  re-import no-op → metadata update → malformed isolation.
- `benchmark.test.ts` (1): measured timings (see benchmark doc).
- `electron/connectorStore.test.mjs` (7): v9 migration + data intact,
  sources/hashes/links/runs/reset, import + evidence, dry-run/preview,
  user-authored conflicts, failure isolation + no auto-delete, IPC allowlist.
- Fixtures: `connectorFixtures.ts` (synthetic Crossref/Zotero payloads).

## 18. Extension guide (future connectors)

1. Add id + meta to `CONNECTOR_IDS`/`CONNECTOR_META`/`CONNECTOR_CAPABILITIES`
   in `connectorCore.mjs`; add definition in `connectorRegistry.ts`.
2. Implement `normalize<Provider>()` → `ExternalItem` in a new adapter
   module (reuse `sanitizeConnectorText`, `tryValidateConnectorUrl`,
   `capRawMetadata`-style bounds).
3. Map to knowledge: extend `buildExtracted` (TS) / `buildRows` (Electron)
   dispatch, or reuse `extractFromCrossref` when DOI-anchored.
4. Identity: prefer a stable provider namespace (`resolveConnectorIdentity`
   already handles generic providers).
5. Wire sync/import through the existing `research:connectors` ops —
   no RAG, knowledge-identity, UI-architecture, SQLite-fundamental, or
   document-extraction changes required.

Candidates (not implemented): arXiv, Semantic Scholar, OpenAlex, PubMed, GitHub.
