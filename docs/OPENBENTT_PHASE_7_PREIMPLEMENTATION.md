# OPENBENTT PHASE 7 — PRE-IMPLEMENTATION FORENSIC AUDIT

> Status: AUDIT ONLY. No source code modified to produce this document.
> Base: openbentt@2.2.5, `electron/researchDb.mjs` SCHEMA_VERSION=10.
> Date: 2026-09-17. Phases 0–6 verified complete via docs + code reads.

---

## 1. Existing connector architecture

**Renderer-neutral core (shared SSOT, plain `.mjs` imported by both renderer TS facades and Electron):**

| File | Lines | Role |
|---|---|---|
| `src/lib/connectors/connectorCore.mjs` | 217 | SSOT: `CONNECTOR_IDS`, `CONNECTOR_META`, `CONNECTOR_CAPABILITIES`, `CONNECTOR_LIMITS`, `fnv1aHex/sanitizeText/normalizeDoi/validateExternalUrl/connectorDocumentId/connectorChunkId/resolveConnectorIdentity/stableStringify/itemHashFor`. Deterministic only — no network, no secrets. |
| `src/lib/connectors/connectorTypes.ts` | 146 | `ConnectorId`, `ConnectorCapability` (11), `ConnectorAuthMode = none\|api-key\|oauth\|custom`, `ConnectorDefinition`, `ExternalItem`, `ImportOptions/ImportResult/DryRunResult`, `SyncState/SyncStatus`, `ConnectorProvenance`. |
| `src/lib/connectors/connectorRegistry.ts` | 50 | Static `DEFINITIONS` (2 entries), `getConnectorDefinition/listConnectorDefinitions/assertKnownConnector`. Unknown → throw. |
| `src/lib/connectors/connectorCapabilities.ts` | 45 | `capabilitiesFor/supportsCapability/requireCapability` — fail-closed gate before any fetch. |
| `src/lib/connectors/connectorSecurity.ts` | 133 | `validateConnectorUrl`, `fetchConnectorJson` (timeout 15s, 2MiB cap, manual 3-redirect with per-hop revalidation, JSON content-type check), `assertBoundedProviderJson` (depth 8, array 2000, obj 500, cycle guard), `sanitizeConnectorText`, `redactConnectorSecrets`. |
| `src/lib/connectors/connectorNormalize.ts` | 229 | `normalizeCrossrefWork/normalizeZoteroItem/validateExternalItem` — bounds: title 1k, abstract 10k, authors 64, items/import 200. |
| `src/lib/connectors/connectorIdentity.ts` | 66 | `resolveIdentityForItem` — DOI-anchored → namespaced provider id → deterministic fallback → null-reject. |
| `src/lib/connectors/connectorEvidence.ts` | 108 | `sourceRefForConnectorItem/evidenceForConnectorEntity/evidenceForConnectorRelationship` — `SourceRef{documentId: connector_<id>, chunkId: cc_*}` verbatim + additive `connector:{connectorId,externalId,url,retrievedAt,providerVersion}`. |
| `src/lib/connectors/connectorSync.ts` | 59 | FSM `never_synced→syncing→synced\|partial\|failed`, `terminalStatusForCounts`, `markStaleItems` (never delete). |
| `src/lib/connectors/connectorImport.ts` | 389 | `dryRunImport` (zero-mutation) / `importExternalItems` against `KnowledgeBackend` + `HashStore` interfaces. Per-item isolation, user-authored precedence (fill-missing only), additive merges, conflicts recorded. |
| `src/lib/connectors/connectorErrors.ts` | 109 | `ConnectorError` taxonomy (`authentication_failed/rate_limited/provider_unavailable/permission_denied/url-blocked/...`). |
| `src/lib/connectors/crossrefConnector.ts` | 100 | `crossrefSearch/crossrefFetchItem` — `https://api.crossref.org/works/`, UA `OpenBenTT/2.0`, rows 1–20. |
| `src/lib/connectors/zoteroConnector.ts` | 137 | `zoteroFetchLibrary/zoteroFetchItem` — `https://api.zotero.org`, `Zotero-API-Version: 3`, paginated `limit=100`, max 200, attachments excluded. |
| `src/lib/connectors/connectorApi.ts` | 110 | Renderer bridge: IPC `research:connectors` when desktop, else `connectorWebStore` fallback. Ops: `list/capabilities/preview/dryRun/import/syncStatus/reset`. |
| `src/lib/connectors/connectorWebStore.ts` | 162 | localStorage fallback `openbentt-connectors-fallback-v1` (hashes/links/sync). |
| `src/lib/connectors/connectorFixtures.ts` | 107 | Deterministic fixtures — TEST ONLY. |

**Durable Electron layer:**

| File | Lines | Role |
|---|---|---|
| `electron/connectorStore.mjs` | 538 | `upsertConnectorSource/listConnectorSources/get/setConnectorItemHash/linkConnectorItem/entityIdForConnectorItem/recordConnectorSyncRun/listConnectorSyncRuns/getConnectorSyncStatus/resetConnector/previewConnectorItems/dryRunConnectorImport/importConnectorItems/getConnectorIdentityInfo`. `KNOWN_CONNECTORS = {crossref, zotero}` fail-closed. |
| `electron/researchDb.mjs` `migrateV9` | ~42 | `connector_sources / connector_items(connector_id,external_id PK,item_hash,status,last_seen_at) / connector_sync_runs (bounded latest 200/connector) / connector_item_links(→knowledge_entities CASCADE)`. |
| `electron/researchProjectService.mjs` L449–513 | — | `research:connectors` 11-op allowlist: `list/get/capabilities/preview/dryRun/import/syncStatus/sync/syncRuns/entityFor/disconnect/reset`. `import` auto-records sync run; `sync` = upsert source + status (no daemon). |

## 2. Existing connector capabilities

- **Crossref** (`authMode: none`): SEARCH + FETCH_ITEM + METADATA + AUTHORS + IDENTIFIERS. No key. CITATIONS honestly omitted.
- **Zotero** (`authMode: api-key`): FETCH_COLLECTION + FETCH_ITEM + METADATA + AUTHORS + IDENTIFIERS + IMPORT. User-id regex `^\d+$`, item-key `^[A-Z0-9]{8}$`, `itemType=-attachment,-note` filter.
- Declared-but-unclaimed caps: `DISCOVER / SYNC / CITATIONS / FULL_TEXT`. No enterprise providers. `CONNECTOR_ID_RE_SRC = ^(crossref|zotero)$` hardcoded in `toolCore.mjs`, `toolStore.mjs`, `researchProjectService.mjs`.
- **Known bug (must fix in Phase 7):** `connectorSecurity.ts:fetchConnectorJson` strips any header matching `/api[_-]?key/i` — which removes `Zotero-API-Key` before fetch. Renderer-side Zotero auth cannot work as written. Fix = explicit per-header allowlist (only strip `Authorization/Cookie`, allow `Zotero-API-Key`), with test.

## 3. Existing OAuth / authentication infrastructure

**There is NO OAuth infrastructure.** Verified by grep (`oauth|OAuth|PKCE|refresh_token|authorization_code` → only type-string `ConnectorAuthMode: "oauth"` and doc mentions; zero flows).

What exists:
- `secretVault.mjs` (136 lines): `safeStorage.encryptString → userData/.secrets/<key>.blob (0600, dir 0700)`, fallback `.secret` plaintext 0600 with `fallback:true` reporting. Allowlist `SECRET_VAULT_KEYS = {provider_api_key, brave_search_api_key}` only. IPC `secretVault:status/load/set/clear`.
- `hfSecretStore.mjs` + `zoteroSecretStore.mjs` (same pattern, per-integration files): `hf_token.blob`, `zotero_api_key.blob`. Zotero web creds in localStorage cleared on desktop connect.
- `redactSecretsInText` wraps log paths; audit stores summaries only (200-char, secret-redacted).
- Renderer providers: BYOK keys in `localStorage openbentt-api-config` plaintext (documented honest limitation) + opt-in `memoryOnlyApiKeys`.

**Gap → Phase 7 MUST build (no insecure shortcut):**
`electron/connectorAuthStore.mjs` (new): per-connector OAuth token vault (`oauth-<connectorId>.blob`, never in DB/IPC payloads/renderer state), `authorizeUrl(state, PKCE) / exchangeCode / refresh / status / revoke / disconnect`, state CSRF (`crypto.randomBytes` + single-use + expiry), loopback callback server on `127.0.0.1` with ephemeral port, least-privilege scopes per provider, token refresh + expiry + reauth signalling. Renderer never holds tokens — only `{status, accountLabel, scopes, expiresAt}` metadata.

## 4. Existing sync architecture

- Model: `SyncState{connectorId,scope?,status,lastAttemptAt?,lastSuccessAt?,cursor?,itemsSeen/Created/Updated/Failed,lastError?,providerVersion?}`.
- No daemon/polling/webhook/cron anywhere (explicitly forbidden by Phase 4 docs). Explicit user-initiated ops only.
- Import idempotency: `itemHashFor(normalized)` + `connector_items.item_hash` skip → `unchanged`; `markStaleItems` never deletes.
- Sync runs pruned to latest 200/connector; `counts_json` drives `getConnectorSyncStatus`.
- **Phase 7 rule: DO NOT create a second engine.** Extend `connectorSync.ts` with stage observability (`DISCOVER→FETCH→NORMALIZE→IDENTITY→DEDUPLICATE→IMPORT→INDEX→ONTOLOGY→AUDIT` mapped onto existing `validate→resolve→map→merge→dedupe→hash/link→sync-run` + knowledge upsert + tool audit), add cursor/lastSuccess/duration fields to `SyncState`, add incremental-sync columns via new migration (additive only).

## 5. Existing document ingestion

`src/lib/documents/` (14 files) + `electron/documentsStore.mjs` + DB `migrateV7` (`documents/document_versions/document_extract_cache`).
Pipeline: `VALIDATE(48MB/100p/220k caps, ZIP-traversal reject, SSRF deny) → IDENTIFY(sha256 → doc_<16>) → DEDUP(checksum + extractorVersion cache) → EXTRACT(PDF-glyphs/MD/TXT/HTML/DOCX/PPTX/XLSX; OCR via UnavailableOcrProvider — never faked) → NORMALIZE(metadata precedence embedded5>user4>url3>filename2>inferred1) → STRUCTURE(heading-led s0..) → CHUNK(480/80 from corpusChunksCore) → INDEX(staleIndex) → READY`. `SourceRef{documentId,versionId?,page?,section?,block?,chunkId,sourceType,sourceUri?}`. URL ingest: HTTPS-only, SSRF blocklist, 3 manual redirects, 15s, 2MB, text/html only.

## 6. Existing search

| API | Location |
|---|---|
| `searchDocuments` (title-boost + term overlap) | `src/lib/documents/search.ts` |
| TF-IDF `findSimilarPassages/scanDraftSimilarity` | `src/lib/research/corpusIndex.ts` |
| Semantic `findSemanticSimilarPassages` (MiniLM-384) | `src/lib/research/embeddingIndex.ts` |
| Fusion RRF k=60 (v2 k=48) + rerank | `src/lib/research/hybridRetrieval.ts`, `retrievalV2.ts` |
| Knowledge `searchEntities/listRelationships/traverse(depth≤3,nodes≤500)/getEvidenceFor` | `electron/knowledgeStore.mjs` + IPC `research:knowledge` (18 ops) |
| Connector `preview/dryRun`, Crossref `crossrefSearchMain` | `electron/connectorStore.mjs`, `electron/toolStore.mjs` |
| Tool `knowledge.search/document.search/connector.search` | Phase 5 (15 tools) |

No cross-source federated search yet. Phase 7 adds `unifiedSearch` as a pure orchestrator over existing search APIs (no new index), with per-source bounded retrieval + snippet redaction + provenance on every hit.

## 7. Existing knowledge graph

`src/lib/knowledge/` (16 files, `knowledgeCore.mjs` SSOT) + `electron/knowledgeStore.mjs` + DB `migrateV8`. 13 entity types, 18 relationship types (only `RELATED_TO` symmetric), statuses, `Evidence{quote≤600, sourceRef verbatim, docVersion, extractorVersion}`, identity `ent_<type>_<fnv8>` / DOI-anchored, merges via redirect rows, stale via version stamp, limits (`maxName 300, maxProps 32, depth 3, nodes 500`). Deterministic extractors only; `KnowledgeEnricher` stub unimplemented. **Phase 7 rule: no second graph.** Enterprise resources map to existing types (paper/person/organization/event/concept/technology + RELATED_TO/AUTHORED_BY/PART_OF) via `extractFromExternalResource`.

## 8. Existing agent / tool integration

- **Phase 5 substrate:** 15 static `TOOL_DEFINITIONS` in `toolCore.mjs` (14× `READ_ONLY/LOW` + `connector.import USER_CONFIRMATION/MEDIUM/mutation:true`). Flow `resolve→validate(strict, unknown keys reject)→context(SAFE_ID projectId)→policy(ALLOW/DENY/CONFIRM; unknown→DENY)→timeout-execute(30s, clamp 1–120s)→output-validate→audit`. `confirmedToolId` binding. Audit table `tool_audit_events` (v10, 2000-row bound, 4 indexes). Tests assert `shell.exec/code/browser/mcp/agent` denied.
- **Phase 6 runtime** (`src/lib/agent/`, 8 modules): single `research-assistant` (15-tool allowlist, 8 steps/6 tools/120s/4k req/8k final/24k ctx/12k obs, 50-run registry). Text protocol ` ```tool / FINAL:`, one attempt per call, model-can-never-confirm, DATA wrapped `[BEGIN/END UNTRUSTED TOOL DATA]`, `agent.run` audit-only. Chat: `ChatContext agentMode/sendAgentMessage/confirmAgentRun/pendingAgentConfirm`, `ChatInput` toggle, `ChatMessages` amber confirm block.
- **Phase 7 rule:** enterprise + MCP capabilities surface ONLY as new registered tools through the same registry/policy/executor/audit. No direct Agent→provider/MCP path. New tools default `READ_ONLY`; any future mutation = `USER_CONFIRMATION`, fail-closed.

## 9. Existing UI architecture

Routes (`App.tsx`): `/, /download, /share, setup, projects, notebook, chat (desktop-only), labs, write, benchmark, webgpu`. Providers: QueryClient→Theme→Tooltip→Chat→LocalModel→ResearchProject→Zotero. `FeatureErrorBoundary` per route. Chat: `ChatContext (1117 lines) / ChatInput / ChatMessages / HomeChatArea / AssistantContent`. Settings: `SettingsPanel (~1139 lines, 7 providers + research depth/proxy/approved-domains + privacy/memoryOnly + vault warnings)` via `AppSettingsDialog`. Research panels: `ResearchSidePanel` switch (`editor/citations/zotero/assistant/knowledge/graph/tools/notes/search/revisions/papers/submit`) → `ToolPanel` (list/describe/execute/CONFIRM + audit last 10), `KnowledgeSearchPanel + ConnectorPanel`, `EntityPanel/EvidenceList/RelationshipList`, document panels. **Phase 7 adds:** `Settings → Integrations`, per-connector detail, `Settings → MCP`, connection wizard, sync progress, chat source selector/filter, `Settings → Security/Data Access` — all additive; no existing chat behavior replaced.

## 10. Existing settings architecture

`SettingsPanel.tsx` + `AppSettingsDialog.tsx`; web `localStorage`, desktop vault IPC. Research settings: depth/proxy/approved-domains. Privacy: `memoryOnlyApiKeys` (web), encrypted-vs-fallback warnings (desktop). Phase 7 follows the same pattern: integration/MCP state lives in main-process stores, renderer sees metadata only.

## 11. Existing Electron security model

Window: `preload.cjs`, `contextIsolation:true, nodeIntegration:false, sandbox:true`. Exactly 5 `contextBridge` surfaces (CI-enforced `scripts/check-electron-security.mjs`): `openbenttDesktop / openbenttLocalGguf / openbenttSecrets / openbenttZotero / openbenttResearch` (~30 methods incl. `knowledge/connectors/tools (op,payload)`). `ipcValidate.mjs` (`ID_RE`, 48MB base64-PDF, traversal-safe dist resolve, llama allowlist). `externalUrlPolicy.mjs` (HTTPS-only + no creds; `app://openbentt/*` + dev loopback). `navigationPolicy.mjs` (`will-navigate/redirect → allow|open-external|deny`, `setWindowOpenHandler → deny`, all permission requests denied). `desktopWindowIpc.mjs` (`EDIT_ROLES` allowlist, `desktop:openExternal` via policy). 78 `ipcMain.handle` total; generic channels op-allowlisted (`research:knowledge` 18, `research:connectors` 11, `research:tools` 5; unknown op → error). No `ipcRenderer`/shell/fs in preload.

## 12. Existing network restrictions

CSP (`scripts/csp-policy.mjs` → meta + nginx header, `check-csp-artifacts.mjs` gate): `script-src 'self' 'wasm-unsafe-eval'`, `connect-src 'self' https: 127.0.0.1/localhost`, `frame/object/child 'none'`. Helper servers (`server/httpPolicy.mjs`): origin check (missing/null + same-origin + loopback + `app://` + exact allowlist), 120/min/IP rate limit, capped bodies (256KB proxy / 8MB latex), 15s upstream timeout, generic 500s. Ingest SSRF (documents `urlIngest.ts` + connectors `connectorCore.validateExternalUrl`): HTTPS-only, no creds, block `10/8,127/8,169.254,192.168,172.16-31,0/8,::1,fc/fd/fe80,metadata.google.internal,*.local|*.internal|*.lan`, 3 manual redirects with per-hop revalidation. `fetchConnectorJson`: header allowlist (fix Zotero bug §2), JSON-CT check.

## 13. Existing audit system

`ToolAuditEvent{eventId,toolId,toolVersion,requestId,timestamp,source,projectId?,permission,risk,decision,status: ok|denied|confirm_required|failed,durationMs,resourceSummary:{input redacted, resourceIds[50], counts},errorCategory?}` → SQLite `tool_audit_events` (2000-row bound) + localStorage mirror. Agent reuses same table (`agent.run` rows, `permission:READ_ONLY`). Never: tokens/keys/passwords/secrets/full message contents. Phase 7: every connector/MCP op emits through the same sink with `{connector, resourceType, operation, runId, requestId, project, decision, result, duration}`.

## 14. Existing database model

`researchDb.mjs`, `node:sqlite DatabaseSync`, WAL+FK, `.bak` every 10 saves/5s debounce. `SCHEMA_VERSION=10`: v1 projects/drafts/bibliography/papers/corpus_chunks/embeddings; v2 jobs; v4 composite chunk PK; v5 files/review; v6 knowledge-blob/chat_logs; **v7 Phase2 documents*; **v8 Phase3 knowledge (7 tables, 11 indexes)**; **v9 Phase4 connectors (4 tables)**; **v10 Phase5 tool_audit_events**. Phase 7 migration **v11 additive only**: `connector_connections` (metadata, NO tokens) + `connector_cursors` (incremental sync) + `mcp_servers` + `mcp_tool_allowlist` metadata; tokens live in `connectorAuthStore` vault files, never in SQLite.

## 15. Existing secrets handling

Desktop OS vault (`safeStorage` → `.secrets/*.blob 0600`); fallback `.secret` 0600 + UI reporting. Keys allowlisted. Renderer never holds provider secrets (Zotero key header-only in main; BYOK web keys localStorage-documented). Logs/audit redacted. **Phase 7:** OAuth access/refresh tokens follow the vault-file pattern per connector (`oauth-<id>.blob`), with `status` reporting `{stored, encryptionAvailable, fallback, expiresAt, scopes}` — never token values.

## 16. What can be reused

`connectorCore` (ids/limits/SSRF/hash/identity), `connectorSecurity` (bounded fetch), `connectorNormalize/Identity/Evidence/Import/Sync` pipelines, `connectorRegistry/Capabilities` pattern, `connectorStore` hash/link/sync-run, knowledge upsert/merge/evidence/traverse, document pipeline + chunking (480/80), hybrid retrieval + RRF, tool registry/policy/executor/audit + `confirmedToolId`, agent loop + confirmation UX, `research:connectors/tools` IPC pattern + preload discipline, vault-file secret pattern, SSRF/CSP/rate-limit helpers, all Phase 0–6 tests (must stay green).

## 17. What needs extension

1. `connectorCore`: Tier-1 defs + `ConnectionState` (`DISCONNECTED/CONNECTING/CONNECTED/AUTH_REQUIRED/SYNCING/SYNCED/ERROR/DISCONNECTING`) + `ExternalResource` unified model + stage enum. 2. New `connectorAuthStore` (OAuth: state+PKCE, loopback callback, refresh, revoke, safe status). 3. New provider clients (6× real REST: Drive/Gmail/Calendar/Slack/GitHub/Notion) reusing bounded fetch. 4. `connectorSync` stage observability + cursor fields + v11 tables. 5. `unifiedSearch` orchestrator + `extractFromExternalResource` knowledge mapper. 6. New `src/lib/mcp/*` (JSON-RPC 2.0 client: stdio-local + https-allowlisted remote; tool→ToolDefinition adapter; resource sanitizer) + `electron/mcpStore.mjs` + `research:mcp` IPC. 7. New tools: `connector.unified_search`, per-connector `connector.<id>.search/list/get` (READ_ONLY), `mcp.tool.execute` (USER_CONFIRMATION), all through Phase 5 gates. 8. UI: Integrations hub + detail + wizard + MCP manager + sync progress + chat source filter + Security center. 9. Tests: registry/schema/OAuth-state/sync/dedup/provenance/isolation/rate-limit/timeout/MCP-policy/prompt-injection/SSRF/redaction/audit/disconnect/reauth/failure-isolation.

## 18. What is missing

OAuth flows, connection-state machine, token vault, 6 enterprise provider clients, incremental cursors, unified resource model, federated search, MCP client/adapter/policy, integration + MCP + security UIs, wizard, sync UX, chat source awareness, confirmation-gated write actions (correctly deferred), Tier-2/3 providers (deferred), browser automation/shell/code-exec (permanently out of scope).

## 19. Exact Phase 7 scope

**7A** audit (this doc). **7B** unified contract (`connectorCore` Tier-1 defs, `ExternalResource`, `ConnectionState`, `enterpriseConnectors.ts` metadata: real scopes/endpoints). **7C** auth infra (`oauthCore` state/PKCE/scope registry + `connectorAuthStore` vault + IPC `research:connectorAuth` + safe status). **7D–7I** six Tier-1 provider clients (real endpoints/pagination/rate-limit/error mapping; READ_ONLY; live-verified only with credentials, else BLOCKED). **7J** unified search orchestrator. **7K** provenance + knowledge mapper. **7L–7N** MCP (JSON-RPC client, tool/resource discovery, adapter to ToolDefinition, policy/audit/SSRF/allowlist). **7O–7R** UI. **7S** agent integration (new tools in allowlist path, no runtime rewrite). **7T–7V** security + electron + regression tests. **7W** docs (architecture/security/integrations/mcp/benchmark/completion).

## 20. Deferred functionality

Tier-2/3 (OneDrive/SharePoint/Dropbox/Linear/Jira/Confluence/GitLab/Box/Discord/Teams/generic REST/webhook) unless 7B–7I proves spare capacity — currently DEFERRED. All write actions (`gmail.send/slack.send/github.merge/notion.write/calendar.write`, PR create/merge, repo mutation, message send) — DEFERRED, confirmation-gated future. Browser automation, shell, code-exec, autonomous external actions, background daemons, multi-agent orchestration — OUT OF SCOPE. Arbitrary MCP transports (raw TCP, unallowlisted remote) — DEFERRED with documented rationale.

## 21. Files to modify

- `src/lib/connectors/connectorCore.mjs` (extend: Tier-1 ids/meta/caps, connection states, resource model — additive)
- `src/lib/connectors/connectorRegistry.ts`, `connectorCapabilities.ts` (Tier-1 entries — additive)
- `src/lib/connectors/connectorSync.ts` (+ stages/cursor fields — additive)
- `src/lib/tools/toolCore.mjs` (+ new tool defs `connector.unified_search`, `mcp.*` — additive; fix `CONNECTOR_ID_RE_SRC` to include Tier-1)
- `src/lib/tools/toolHandlers.ts`, `electron/toolStore.mjs` (+ handlers routing to connector/MCP stores — additive)
- `electron/connectorStore.mjs` (+ connection-state + cursor ops — additive)
- `electron/researchDb.mjs` (+ `migrateV11` additive tables)
- `electron/researchProjectService.mjs` (+ `research:connectorAuth`, `research:mcp` channels — additive)
- `electron/preload.cjs` (+ `connectorAuth/mcp` methods on `openbenttResearch` — additive, stays within surface count discipline)
- `src/lib/agent/agentDefinitions.ts` (allowlist extension — additive)
- Chat/settings UI (new components + wiring — additive)
- **New files:** `src/lib/connectors/oauthCore.ts`, `providers/*.ts` (6), `unifiedSearch.ts`, `externalResource.ts`, `knowledgeMapper.ts`, `src/lib/mcp/*` (5), `electron/connectorAuthStore.mjs`, `electron/mcpStore.mjs`, UI components (7), tests (8+).

## 22. Protected files (DO NOT rewrite; extend only, else STOP + document)

Phase 2 `src/lib/documents/*` + RAG constants/pipeline; Phase 3 `src/lib/knowledge/*` + `electron/knowledgeStore.mjs`; Phase 4 `connectorNormalize/Identity/Evidence/Import` semantics; Phase 5 `toolRegistry/toolPolicy/toolExecutor/toolSchema` + audit shape; Phase 6 `agentRuntime/agentPrompt` loop; `server/httpPolicy.mjs`; `electron/ipcValidate/externalUrlPolicy/navigationPolicy/main.mjs` window hardening; standard chat pipeline (`ChatContext` message flow). Changes limited to additive allowlists/definitions.
