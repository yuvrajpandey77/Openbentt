# Openbentt Phase 6 — Pre-Implementation Forensic Audit

Version: openbentt@2.2.5 · SQLite SCHEMA_VERSION=10 · Date: 2026-09-17
Status: read-only audit for Phase 6 (Controlled Intelligence / Agent Runtime).
No code was modified during this audit. No agent loop/planner/MCP exists.

## 1. Existing architecture

Desktop-first local-first AI workspace (Electron, `electron/main.mjs`) + Vite
React renderer. Shared plain-JS cores (`knowledgeCore`, `connectorCore`,
`toolCore`, `corpusChunksCore`, `embedCore`) give renderer + main zero-
divergence logic. IPC: fixed-arity channels + three generic op-allowlist
channels (`research:knowledge` 18 ops, `research:connectors` 11 ops,
`research:tools` 4 ops) on the `openbenttResearch` bridge; preload exposes 5
bridges, no `ipcRenderer`/shell/fs. SQLite `research.db` (WAL+FK, `.bak`
recovery) v1→v10 additive; web mirrors in localStorage.

## 2. Existing chat architecture

`src/context/ChatContext.tsx` (1117 lines, mounted once in `App.tsx:82`):
`chats/currentChatId/isLoading/apiConfig`, `sendMessage(content,attachments,
options?)`, `regenerateLastResponse`, `beginEditUserMessage`,
`queuePromptInComposer`, `stopStreaming`, `registerNotebookAssistSync`,
`registerCorpusRagProvider`, `registerChatLogPersister`. Flow:
`ChatInput.handleSendMessage` → `sendMessage` (guards, PDF inline,
`substituteInlineCalc`, user append) → `buildPipelineExtras` (auto-RAG via
registered corpus provider, optional `gatherResearchContext`, system prompts)
→ `runAssistantPipeline` (single or tiled comparison, placeholder message +
`createRafBatcher` deltas → finalize metrics/title/persist). Message type
(`src/types/chat.ts`) already carries `researchSources?`, `agentTrace?`
(`AgentTraceStep{step,detail}`), `metrics?`, `streaming?`. History: web
localStorage (`openbentt-chats`); desktop research turns fire-and-forget to
`chat_logs`. No `appendMessage` primitive — agent integration must add one
additive method, not rewrite the pipeline.

## 3. Existing model architecture

`AiProvider` (7): openrouter/openai_direct/openai_compatible/anthropic/
google/webgpu_gemma/local_gguf. Reusable entries: `streamChatForConfig(cfg,
model, messages, signal, callbacks)` (`aiStream.ts:225`, cloud providers) and
`streamRoutedTask(task, cfg, messages, signal, callbacks)` (
`modelRouting/index.ts:34` — routes by task incl. local GGUF/Gemma, offline
assert, returns `{text, metrics, route}`). Tasks: `chat_general |
chat_lightweight | chat_drafting | chat_synthesis | embedding | code_assist`.
Keys live in `ApiKeyConfig` (web localStorage w/ memory-only option; desktop
OS vault via `openbenttSecrets`; never in agent state). No timeout/retry on
streams (single flight, manual regenerate only). Agent reuse target:
`streamRoutedTask("chat_general"|"chat_lightweight", …)` — no new gateway.

## 4. Existing document pipeline

Phase 2 `DocumentService` (in-memory registry; desktop persists metadata via
`documentsStore.mjs`): ingest/inspect/`getChunks`/`searchDocuments`
(substring + term overlap, limit 20)/`findDuplicate`/reindex; URL ingest
HTTPS-only + SSRF + 15s/2MB/3-hop caps; chat attachments (image/audio/video-
frame/pdf ≤12MB, PDF text ≤96k chars) inlined into prompt; `DOCUMENT_LIMITS`
(48MB/100pp/220k chars). Tools expose `document.search/get/inspect` as
local-only. Nothing to rebuild; agent reads through tools.

## 5. Existing knowledge pipeline

Phase 3 identity (`ent_<type>_<fnv8>`, DOI papers, namespaced external ids),
validation (`ID_RE`/`NAMESPACE_RE`), `boundedTraverse` (depth≤3/nodes≤500),
evidence→SourceRef, merge-preserving stores, user-authored precedence.
Tools expose search/get/relationships/evidence + export. Agent reads through
tools; no identity/traversal changes permitted.

## 6. Existing RAG/retrieval pipeline

Chunker 480/80 (`corpusChunksCore.mjs`, asserted in tests); embeddings
`Xenova/all-MiniLM-L6-v2`, 384-dim, q8, 512-char, 120-chunk cap
(`embedCore.mjs`); hybrid `hybridRetrieveV2` (limit 16, minFused 0.008,
RRF k=48, lex 0.45/sem 0.55) + `dedupeRetrievalHits`; auto-RAG registered per
project (`hybridRetrieveV2 limit:6 → formatRetrievalForPrompt 8000 chars`,
header marks text untrusted). Project caps (`projectLimits.ts`: 500 papers,
2M draft chars). Agent must NOT touch constants; retrieval enters agent
context via tools/document.search, never by reimplementation.

## 7. Existing tool architecture

Phase 5: 15 static tools (4 knowledge, 3 document-local, 5 connector, 1
project, 1 export, 1 utility-local); strict schemas (unknown keys rejected);
12 capabilities; READ_ONLY×14 + USER_CONFIRMATION (`connector.import`,
MEDIUM); deterministic policy ALLOW/DENY/CONFIRM; stepped executor
(resolve→validate→policy→timeout-bounded execute→output-validate→audit);
audit ledger (SQLite v10 `tool_audit_events`, 4 indexes, 2000-row bound;
localStorage mirror); `toolApi{list,get,execute,audit}` (IPC unless
local-only); `ToolPanel` (list/inspect/JSON-execute/confirm/audit). Only
`connector.search` uses network (allowlisted Crossref); only
`connector.import` mutates. Contract identical Web/Electron.

## 8. Existing security boundaries

AppError/ToolError/ConnectorError taxonomies (safe generics); SSRF policies
(documents/connectors/main/proxy); IPC validation (`assertSafeId`, path
guards); secret vaults (main-only) + redaction everywhere (audit/tools/logs);
CSP (build plugin + nginx + artifact gate); Electron gates
(nodeIntegration off, 5 bridges, nav/permission deny); prompt-injection
hygiene (`sanitizeDocumentTextForPrompt` [UNTRUSTED] wrap,
`detectDocumentInjectionWarnings` 7 patterns, `stripDocumentPromptMarkers`);
bounded outputs; no secrets in context/audit. Agent adds NO new boundary —
it lives inside policy.

## 9. Existing Electron boundaries

78 `ipcMain.handle` channels; preload 5 bridges; main owns SQLite/secrets/
servers; renderer never touches DB/fs/creds. Agent runtime is
renderer-side (uses `toolApi` + `streamRoutedTask`); needs zero new IPC
except one additive `audit`→`record` op so run-level events persist on
desktop (reuses `recordToolAuditEvent`; no new table).

## 10. Existing persistence

SQLite v10 (projects/drafts/papers/chunks/embeddings/jobs/chat/documents/
knowledge/connectors/tool-audit); localStorage mirrors (chats, projects,
knowledge, connectors, tool-audit). Agent runs: in-memory only (bounded 50)
+ per-tool audit rows + `agentTrace` on the persisted chat message — no new
tables, no document duplication (IDs + bounded summaries in state).

## 11. Existing streaming behavior

Uniform `fetch + ReadableStream.getReader` + `{onDelta, onUsage?}` across
all providers; `createRafBatcher` (192 chars/80ms) for UI; per-run
AbortController + `stopStreaming`; local-model progress callbacks. Agent
reuses `onDelta` (final answer streams; intermediate reasoning never
streamed) + `onStep` activity callback mapped to `AgentTraceStep`.

## 12. Existing error handling

`StreamHttpError/ModelRouteError/OfflineBlockedError`, user-facing formatter
+ secret redaction, per-tile inline errors, no auto-retry (manual
regenerate), RAG/research degrade-to-continue. Agent errors mirror this:
structured `AgentError` kinds (TIMEOUT/STEP_LIMIT/TOOL_DENIED/CONFIRMATION/
INVALID_INPUT/FAILED/MODEL_FAILURE/CONTEXT_LIMIT/OUTPUT_LIMIT/SCOPE),
per-step containment, no autonomous retries (deferred per audit).

## 13. Existing UI architecture

`HomeChatArea/ChatMessages/ChatInput/AssistantContent/...`,
`NotebookChatDock/FloatingChat` share `useChat()`. `ChatMessages` renders
`agentTrace` collapsibly behind existing `showAgentTraces` toggle — agent
activity reuses it (safe metadata only, never chain-of-thought). Side panels
(11 incl. `tools`→ToolPanel). Toasts via Sonner; confirms via Radix
AlertDialog or ToolPanel two-step buttons. Agent mode: additive toggle +
confirm affordance; no UI replacement.

## 14. Existing test architecture

Vitest node env (`src/**/*.test.ts`, 30s timeout) + localStorage mock
helper; Electron `node --test` (19 files); Playwright chromium (2 specs).
Phase 5 baseline: vitest 444+1, electron 96, tsc 54 pre-existing errors,
Playwright 5+4. Agent tests follow colocated vitest + node:test for the IPC
record op; model stubbed via injected `modelFn` (deterministic, no network).

## 15. What can be reused

`streamRoutedTask` (+ tasks/router), `toolApi.execute/list/get`,
`inspectTool`, Phase 5 policy/executor/audit/validators, audit scrubber,
`AgentTraceStep` render path, `createRafBatcher`, AbortController idiom,
`sanitizeDocumentTextForPrompt` + injection-warning regexes, `buildModel
ManagerSnapshot` route labels, toast/AlertDialog/ToolPanel confirm patterns,
all fixtures + localStorage mock.

## 16. What must be extended

1. `src/lib/agent/` (new): types/state/errors/limits, prompt builder +
   proposal parser + untrusted-data wrappers, bounded runtime loop, one
   built-in `research-assistant` definition, chat wiring helper.
2. `ChatContext.tsx` (additive only): `agentMode` flag + `sendAgentMessage`
   + `confirmAgentRun` + run registry refs; no existing flow touched.
3. `ChatMessages.tsx` (additive): confirm-button block for suspended runs.
4. `ChatInput.tsx` or dock (additive): agent-mode toggle.
5. `research:tools` IPC (additive): `record` op → `recordToolAuditEvent`.
6. ToolPanel: unchanged (already supports confirm pattern).

## 17. What is genuinely missing

Bounded agent loop; model tool-proposal protocol (text ` ```tool {...} ` /
`FINAL:` — no function-calling API assumed); tool definitions projected for
the model from the Phase 5 registry (no schema duplication); observation
budgeting; run state + suspension/resume for confirmations; run-level audit
events; injection tests for the agent path; benchmark for agent overhead.

## 18. What should explicitly NOT be built in Phase 6

Agent loop variations (planner/reflection/memory/coding/browser/research
agents), MCP, shell/code/browser/email/deployment/financial tools,
`project.update`, document-ingest tools, retrieval/synthesis/citation tool
wrappings, retry budgets, autonomous memory, role agents, second RAG,
second streaming, second audit, new model gateway, new dependencies.

## 19. Risks

1. Model non-compliance with the proposal protocol → mitigated: strict
   parser, non-conforming text treated as final answer, policy still gates
   everything.
2. Prompt injection via tool results → mitigated: DATA wrapping + system
   rules + structural guarantees (policy never reads output; confirmations
   never from model; projectId forced from context).
3. Runaway cost/latency → mitigated: 8 steps / 6 tool calls / 120s run /
   30s per-tool caps, fail-closed errors.
4. Confirmation UX dead-ends → mitigated: suspend/resume with explicit UI
   state, never auto-resume.
5. ChatContext bloat/regression → mitigated: additive methods only, full
   existing chat suites must stay green.

## 20. Proposed Phase 6 architecture

```
USER → CHAT (agent mode) → AGENT RUNTIME (bounded loop, renderer-side)
  → model (streamRoutedTask, existing abstraction, scoped context only)
  → proposal (```tool / FINAL:) → parser (strict)
  → Phase 5: registry → policy → executor → services → audit
  → observation (bounded, DATA-wrapped) → … → FINAL RESPONSE (streamed)
  → message (content + agentTrace + researchSources) + run audit events
```

`src/lib/agent/`: `agentTypes.ts agentErrors.ts agentPrompt.ts
agentRuntime.ts agentDefinitions.ts agentChat.ts index.ts` (+ tests).
Model switching: injected `modelFn` (default: routed task), enabling local
and cloud providers without new code.

## 21. Exact files expected to change

ADD: `src/lib/agent/*` (7 + 3 test files), `electron/agentAudit.test.mjs`,
`docs/OPENBENTT_PHASE_6_{ARCHITECTURE,SECURITY,COMPLETION,BENCHMARK}.md`.
MODIFY (additive): `src/context/ChatContext.tsx` (`agentMode`,
`sendAgentMessage`, `confirmAgentRun`, run registry), `src/components/
ChatMessages.tsx` (confirmation block), `src/components/ChatInput.tsx`
(mode toggle), `electron/researchProjectService.mjs` (`record` op),
`electron/toolStore.test.mjs` (record-op case — or new file; prefer new
`agentAudit.test.mjs` to avoid touching Phase 5 tests), `package.json`
(test manifest entry).

## 22. Exact files that must remain protected

RAG constants/pipeline (`corpusChunksCore`, `embedCore`, `hybridRetrieval`,
`retrievalV2`, workers, vector store); Phase 2 service/extractors/chunking/
SourceRef/`documentsStore`; Phase 3 identity/extract/validation/traversal/
`knowledgeStore`; Phase 4 normalize/identity/import/`connectorStore`;
Phase 5 registry/policy/executor/`toolStore` logic/`toolApi`; existing
`sendMessage` pipeline, streaming transports, migrations v1–v10, CSP/secret/
SSRF machinery, `mathInline`, exporters, citation/synthesis modules.
