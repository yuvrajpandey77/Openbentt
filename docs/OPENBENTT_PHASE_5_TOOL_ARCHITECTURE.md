# Openbentt Phase 5 — Tool Architecture

Deterministic, permission-aware tool execution substrate for future agents.
No agent loop, no planner, no MCP, no autonomous behavior — the caller in
this phase is UI, a deterministic application service, or an explicit user
action. No LLM is required for tool execution.

## 1. Why the tool layer exists

Phases 2–4 built capable services (documents, knowledge, connectors) but each
with its own calling convention. Future agents must not call SQLite, IPC,
connectors, the filesystem, or document services directly. The tool layer is
the single controlled interface:

```
USER / UI / service
        |
        v
  Tool Registry (static, 15 tools)
        |
        v
  Policy Engine (ALLOW / DENY / CONFIRM)
        |
        v
  Tool Executor (validate → execute → validate → audit)
        |
  +-----+-----+-----+
  |           |           |
Knowledge  Documents  Connectors (+ project / export / utility)
  |           |           |
  +-----+-----+-----+
        |
     Evidence → SourceRef
```

## 2. Tool contract

`ToolDefinition` (`toolTypes.ts`, data-only in shared `toolCore.mjs`):

- `id` (`knowledge.search`), `name`, `description`, `version` (`"1"`)
- `category`: READ | SEARCH | KNOWLEDGE | DOCUMENT | CONNECTOR | EXPORT | UTILITY | WRITE
- `inputSchema` / `outputSchema`: data-driven field schemas
  (`type required maxLength maxItems enum pattern minimum maximum integer
  fields items freeform`); unknown input keys are rejected (strict v1)
- `capabilities`: declared subset of the 12 known capabilities
- `permission`: READ_ONLY | USER_CONFIRMATION | USER_INITIATED_WRITE | SYSTEM_INTERNAL
- `risk`: LOW | MEDIUM | HIGH (consumed by policy, not decoration)
- `executionMode`: `local` (caller runtime: document.*, utility.*) or
  `backend` (Web/Electron stores)
- `externalNetwork` / `mutation` flags for transparency

Unregistered functions can never become tools: both executors resolve ids
against the static registry first and deny unknown ids before any other step.

## 3. Registry

15 tools, all wrapping existing functionality (inventory in §11–15):

- KNOWLEDGE (4): `knowledge.search`, `knowledge.get_entity`,
  `knowledge.get_relationships`, `knowledge.get_evidence`
- DOCUMENT (3): `document.search`, `document.get`, `document.inspect`
- CONNECTOR (5): `connector.list`, `connector.get`, `connector.preview`,
  `connector.search`, `connector.import`
- READ (1): `project.get`
- EXPORT (1): `export.create`
- UTILITY (1): `utility.calculate`

`inspectTool(id)` returns the public view (never implementation).
No SHELL / CODE_EXECUTION / BROWSER_AUTONOMY categories exist.

## 4. Capabilities

`knowledge.read/search/traverse`, `document.read/search`, `connector.read/
search/preview/import`, `project.read`, `export.create`, `utility.compute`.
Each tool declares exactly what it needs; capabilities cannot be requested
dynamically; unknown capabilities fail closed at policy time.

## 5. Permissions

- `knowledge.search/get_entity/get_relationships/get_evidence`,
  `document.*`, `connector.list/get/preview/search`, `project.get`,
  `export.create`, `utility.calculate` → READ_ONLY (always ALLOW).
- `connector.import` → USER_CONFIRMATION (CONFIRM until explicit
  confirmation for that tool id).
- No USER_INITIATED_WRITE or SYSTEM_INTERNAL tools are registered in v1
  (permission classes exist in the model for future use; no autonomous
  permission class exists).

## 6. Risk model

LOW: all reads, preview, search, calculate. MEDIUM: `connector.import`
(external data becomes local knowledge). HIGH: reserved, unregistered.
Policy consumes risk: non-LOW `USER_INITIATED_WRITE` tools would require
confirmation; the MEDIUM import tool requires it via USER_CONFIRMATION.

## 7. Execution context

`ToolExecutionContext`: `projectId userInitiated userConfirmed
confirmedToolId systemInternal source requestId timestamp`. Validated
(ID formats, string bounds, boolean types); carries no secrets, no Electron
internals, no renderer objects. Confirmation binds to `confirmedToolId` so a
confirmation for one tool cannot authorize another.

## 8. Policy

Deterministic `evaluatePolicy(tool, context)` in shared core:

- unknown tool/capability/permission/risk → DENY
- READ_ONLY → ALLOW; SYSTEM_INTERNAL → ALLOW only with flag
- USER_INITIATED_WRITE → DENY unless userInitiated (+CONFIRM if risk ≠ LOW)
- USER_CONFIRMATION → ALLOW only with matching userConfirmed/confirmedToolId,
  else CONFIRM

## 9. Confirmation

`buildToolRequest` produces `{ toolId toolVersion summary riskLevel
requestedCapabilities affectedResources confirmationRequired }`, returned in
the CONFIRM result's `data` for UI rendering. The executor never performs a
confirmation-gated operation without a matching confirmation in context; the
ToolPanel renders a dedicated confirm-and-execute button only in that state.

## 10. Audit

Every execution (including DENY/CONFIRM/failed) emits a `ToolAuditEvent`:
`eventId toolId toolVersion requestId timestamp source projectId permission
risk decision status durationMs resourceSummary{input(resourceIds counts}
errorCategory`. Inputs are scrubbed (secret key/value redaction, 200-char
 truncation, depth cap); only identifiers and bounded summaries are stored —
 never secrets, keys, full documents, raw inputs, or provider payloads.

## 11. Knowledge tools

- `knowledge.search{query entityType tag identifier status projectId limit≤100}`
  → service search (project-scoped at the service layer).
- `knowledge.get_entity{entityId}` → entity + provenance summary.
- `knowledge.get_relationships{entityId direction relationshipType depth≤3
  limit}` → depth 1 uses listRelationships; depth 2–3 reuses Phase 3
  `boundedTraverse` (no second implementation; traversal itself is an
  unscoped graph walk, isolation enforced at search/list layer).
- `knowledge.get_evidence{entityId relationshipId limit≤200}` → evidence with
  SourceRef provenance. Existing limits enforced, never bypassed.

## 12. Document tools

- `document.search{query projectId sourceType author limit}` → bounded hits
  (id/title/type/page/snippet≤400/score).
- `document.get{documentId}` → bounded metadata + chunk count (no paths, no
  binary, no full text).
- `document.inspect{documentId maxBlocks≤50 maxChunks≤20}` → sections,
  bounded blocks/chunks/references + a SourceRef.
- `executionMode: local` — they run against the renderer DocumentService
  registry even on desktop; the main process exposes only bounded metadata
  summaries for parity checks.

## 13. Connector tools

- `connector.list/get` → registry declarations + sync status (no network).
- `connector.preview{items≤200}` → Phase 4 validation/summary, no mutation.
- `connector.search{query rows≤20}` → Crossref only (allowlisted host via the
  Phase 4 boundary; main process uses a no-redirect fail-closed fetch).
  Returns `retrievedAt`/`sourceVersion` — external data is not pretended
  deterministic.
- `connector.import{items≤200 projectId dryRun}` → USER_CONFIRMATION +
  MEDIUM; delegates to the Phase 4 engine (hash idempotency, conflicts,
  user-authored precedence reused; never duplicated).

## 14. Project tools

- `project.get{projectId}` → bounded summary (id/title/venue/updatedAt +
  paper/draft/bibliography/knowledge sizes). No full draft, no embeddings.
- `project.update` deferred (no new mutation semantics in Phase 5).

## 15. Export/utility tools

- `export.create{projectId entityIds≤200 maxEntities≤500}` → validated
  `openbentt-knowledge-v1` JSON (2MB build cap, 500KB inline cap with
  `truncated` flag + counts). Existing `exportKnowledge` reused.
- `utility.calculate{expression≤200}` → bounded recursive-descent evaluator
  (numbers, + - * / % ^, parens, unary minus, sqrt/abs/round/floor/ceil/
  min/max/pow; charset allowlist, token blocklist incl. import/eval/Function/
  constructor/prototype/process, 15-digit runs, depth/iteration/magnitude
  caps). Rationale: mathjs full-battery `evaluate()` permits
  `import()`/symbol-access patterns unsuitable for a tool boundary, and
  loading mathjs into the Electron main process is unwanted; the existing
  `substituteInlineCalc` stays untouched as the UI affordance.

## 16. Security

Boundary checks before dangerous operations: unknown-tool rejection, strict
schemas (unknown fields, bounds, enums, id formats), capability/permission/
risk/confirmation enforcement, project scoping at the service layer, output
validation with `invalid_output` failures, bounded outputs everywhere,
redacted audit, parameterized SQL, SSRF-safe connector fetch, no secrets in
context/audit/logs, timeout races on execution. Tested: SQL injection strings
are inert, path traversal ids rejected, secret-shaped content redacted,
arbitrary tool ids (shell/code/browser/mcp/agent) denied.

## 17. IPC

Single channel `research:tools` (`list/get/execute/audit`) on the existing
bridge; preload adds one `tools(op, payload)` method; local-only tools never
reach IPC (routed locally by `toolApi`). Renderer `toolApi` offers the
identical contract on Web (local executor + localStorage audit) and Electron
(IPC + SQLite audit).

## 18. Web/Electron parity

Contract identical; backends differ: renderer handlers use `knowledgeApi` /
`DocumentService` / `connectorApi` / `projectStore` / `exportKnowledge`;
main handlers use `knowledgeStore` / `connectorStore` / `researchDb`
(documents + calculate are local-only). Shared `toolCore.mjs` guarantees one
policy/schema/calculator/audit-shape source; integration + parity tests assert
tool results equal direct service results on both runtimes.

## 19. Extension guide

1. Add the definition object to `TOOL_DEFINITIONS` in `toolCore.mjs`
   (single source; TS gets types via the barrel).
2. Add a handler entry in `toolHandlers.ts` (renderer) and `HANDLERS` in
   `toolStore.mjs` (main) delegating to an existing service.
3. Declare capabilities/permission/risk honestly; mutation tools need
   USER_CONFIRMATION or USER_INITIATED_WRITE.
4. Add unit + parity + audit tests; document in the inventory (§20 of the
   completion report). No RAG/knowledge/connector/document changes required.

## 20. Future agent integration

Agents will call `toolApi.execute` / `research:tools execute` only. They
cannot reach SQLite, IPC channels, connectors, the filesystem, or document
services except through registry → policy → executor → audit. Adding MCP
later means translating MCP tool calls into this registry, not bypassing it.
