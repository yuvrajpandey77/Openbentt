# Phase 5 Complete

## 1. Executive Summary

Phase 5 (Tools Foundation + Controlled Execution) is implemented, tested,
and regressed. A deterministic tool substrate now wraps existing Phase 2/3/4
capabilities behind a static registry (15 tools), strict schemas, a
deterministic policy engine (ALLOW/DENY/CONFIRM), a stepped executor, and a
durable audit ledger — with zero new dependencies, no LLM involvement, and
no autonomous behavior of any kind. No agent loop, planner, MCP, shell, code
execution, or browser autonomy was built.

## 2. Pre-Implementation Findings

See `docs/OPENBENTT_PHASE_5_PREIMPLEMENTATION.md`. Key findings that shaped
the design: (a) knowledge/document/connector/project/export services were
already effectively callable but lacked a formal boundary; (b) the only
calculator (`mathInline.ts`) wraps full-battery mathjs `evaluate()`, which
permits `import()`/symbol-access patterns unsuitable for a tool boundary —
so `utility.calculate` uses a small audited bounded parser instead;
(c) document chunk text lives renderer-side, so document tools are
`executionMode: local`; (d) no dedicated audit table existed, so v10 adds
one rather than overloading jobs/snapshots/sync-runs.

## 3. Tool Architecture

Registry → policy → executor → services → audit; contract identical on
Web/Electron, backends differ. Full detail:
`docs/OPENBENTT_PHASE_5_TOOL_ARCHITECTURE.md` (§1–2, §16–20).

## 4. Tool Contract

Data-only `ToolDefinition` (single source in shared `toolCore.mjs`):
id/name/description/version/category/inputSchema/outputSchema/capabilities/
permission/risk/executionMode/externalNetwork/mutation. Strict v1 schemas
reject unknown fields; outputs validated with `invalid_output` failures.

## 5. Registry

15 tools, all wrapping existing functionality; `inspectTool` exposes no
implementation; unknown ids denied before any other step.

## 6. Capability Model

12 capabilities (`knowledge.read/search/traverse`, `document.read/search`,
`connector.read/search/preview/import`, `project.read`, `export.create`,
`utility.compute`). Declared per tool, never requested dynamically, unknown
fails closed at policy time.

## 7. Permission Model

READ_ONLY (14 tools → ALLOW), USER_CONFIRMATION (`connector.import` →
CONFIRM until matching confirmation), USER_INITIATED_WRITE/SYSTEM_INTERNAL
defined but unregistered (no autonomous permission class exists).

## 8. Risk Model

LOW (all reads/preview/search/calculate), MEDIUM (`connector.import`),
HIGH reserved/unregistered. Policy consumes risk; confirmation binds to
`confirmedToolId` so confirmations cannot transfer between tools
(test-asserted).

## 9. Policy Engine

Deterministic `evaluatePolicy` in shared core: unknown
tool/capability/permission/risk → DENY; READ_ONLY → ALLOW;
USER_INITIATED_WRITE → DENY unless initiated (+CONFIRM if non-LOW);
USER_CONFIRMATION → ALLOW only with matching confirmation, else CONFIRM.

## 10. Execution Context

`projectId userInitiated userConfirmed confirmedToolId systemInternal source
requestId timestamp` — validated, bounded, secret-free. ToolPanel sends
`userInitiated: true, source: "tool-panel"`; confirmation resends with
`userConfirmed + confirmedToolId`.

## 11. Knowledge Tools

`knowledge.search` (project-scoped service search, limit≤100),
`knowledge.get_entity` (+ provenance summary), `knowledge.get_relationships`
(depth 1 = list with direction mapping; depth 2–3 = Phase 3
`boundedTraverse`, no second implementation), `knowledge.get_evidence`
(limit≤200). Parity-tested against direct service calls.

## 12. Document Tools

`document.search` (bounded hits: id/title/type/page/snippet≤400/score),
`document.get` (metadata + chunk count; no paths/binary/full text),
`document.inspect` (sections + bounded blocks/chunks/references + SourceRef).
Local executionMode; main process exposes bounded metadata summaries only.

## 13. Connector Tools

`connector.list/get` (declarations + sync status, no network),
`connector.preview` (Phase 4 validation, no mutation),
`connector.search` (Crossref allowlisted host only, rows≤20, retrieval
metadata returned), `connector.import` (USER_CONFIRMATION/MEDIUM, delegates
to the Phase 4 engine — hash idempotency, conflicts, user-authored
precedence reused, never duplicated).

## 14. Project Tools

`project.get` (bounded summary: id/title/venue/updatedAt + paper/draft/
bibliography/knowledge sizes; no full draft, no embeddings).
`project.update` deferred — no new mutation semantics.

## 15. Export/Utility Tools

`export.create` (validated `openbentt-knowledge-v1`, entityIds≤200,
maxEntities≤500, 2MB build cap, 500KB inline cap with `truncated` flag).
`utility.calculate` (bounded parser; see architecture §15 for the mathjs
decision record).

## 16. Audit System

Every execution (ok/denied/confirm_required/failed) emits a structured event
with identifiers + scrubbed bounded summaries only. SQLite v10
`tool_audit_events` (4 indexes, EXPLAIN-verified, 2000-row bound) on
Electron; bounded localStorage ledger (2000) on web. Secret-shaped content
verified redacted in tests.

## 17. IPC

`research:tools` (`list/get/execute/audit`) with op allowlist; preload adds
one `tools(op, payload)` method; local-only tools never reach IPC (routed
locally by `toolApi`). IPC-tested: unknown ops/ids rejected, local tools
refused over IPC.

## 18. Security

Enforcement before execution at every step; project scoping at the service
layer; bounded outputs; redacted audit/logs; parameterized SQL; SSRF-safe
connector fetch (main: no-redirect fail-closed). Tested: unknown/malformed/
oversized inputs, unknown/unauthorized capabilities, permission + risk +
confirmation enforcement incl. bypass attempts, cross-project isolation,
SQL-injection strings inert, path-traversal ids rejected, secret leakage
absent, output-size limits, typed timeouts, no shell/code/browser/mcp/agent
tool ids.

## 19. UI

`ToolPanel` (new `tools` tab, Wrench icon): tool list with
description/category/risk/permission/capabilities/version + mutation/network
flags; per-tool JSON input, execute, CONFIRM-state confirm-and-execute,
result with decision/duration/requestId, recent audit events. Transparency
and testing only — no planner, no chat-based invocation.

## 20. Testing

- `tools.test.ts` (37): registry/inventory, schemas, malformed/oversized/
  unknown-field/enum/id-format rejection, policy matrix, confirmation +
  bypass, all 15 tools, project isolation (input + context scope), audit
  generation/redaction, size limits, timeouts, SQL/path/arbitrary-execution
  resistance.
- `toolIntegration.test.ts` (6): full lifecycle + direct-API parity for
  knowledge/documents/connectors, allowlisted-host assertion, requestId
  audit chain.
- `electron/toolStore.test.mjs` (11): v10 migration + intact data + index
  use, registry inspection, store parity, unknown/bad/local rejection,
  import confirmation→idempotent execution + bypass denial, list/get/preview,
  bounded project summary, validated export, audit persistence/redaction/
  filtering, store-layer isolation, IPC allowlist.
- `benchmark.test.ts` (1): measured timings (see §21).

## 21. Benchmark

See `docs/OPENBENTT_PHASE_5_BENCHMARK.md` (actual output): lookup 0.2ms/1000,
validation 3.8ms/1000, policy 0.9ms/1000; knowledge.search median 0.08ms
p95 0.24ms; 100 mixed executions 2.1ms (~46k/s); 1000 calculates 10.7ms
(~93k/s). Network/import paths excluded as provider-bound (documented).

## 22. Regression

- `npx vitest run`: 444 passed, 1 skipped (baseline 400+1; +44 tools tests).
- `npm run test:electron`: 96 passed (baseline 85; +11 toolStore tests).
- `npm run build` + `test:csp` + `lint:electron-security` +
  `lint:electron-pack`: pass.
- `npx eslint` on all Phase 5 files: clean.
- `tsc -p tsconfig.app.json`: 54 errors before and after (pre-existing
  baseline; 5 transient Phase 5 errors introduced mid-work were fixed to
  zero; verified by count + path grep).
- Playwright: 5 passed, 4 skipped (identical to Phase 4 baseline).
- `git diff` on protected paths (documents/knowledge/connectors/RAG
  workers/retrieval/chunking/embeddings): no modifications. RAG constants
  (480/80, MiniLM-L6-v2, 384, q8, 120 cap, 512 batch, TF-IDF, RRF k=60,
  v2 k=48, weights, min fused score) untouched — verified by diff grep.
- No agent loop/planner/reflection/retries/MCP/shell/browser-automation
  code exists (grep-verified; only negative test assertions + doc comments
  mention them).
- Not executed (headless environment, as in Phase 4): Electron smoke/packaging
  runs.

## 23. Files Changed

Committed in HEAD (`672e89b`, author session commit): Phase 5 core
(`src/lib/tools/` — core/types/errors/schema/policy/definitions/registry/
handlers/executor/webstore/api/barrel/fixtures/tests), `electron/toolStore.mjs`,
v10 migration + `research:tools` IPC + preload method, `ToolPanel` + `tools`
tab wiring (3 one-line edits), pack/test manifest entries,
`OPENBENTT_PHASE_5_PREIMPLEMENTATION.md`.

Uncommitted (this session, left for review per no-commit rule):
`electron/toolStore.mjs` (connectorCore import fix), `src/lib/tools/
toolSchema.ts` (tsc-safe rewrite), `src/lib/tools/tools.test.ts` (audit-sink
wiring, tuple-cast fixes), new `electron/toolStore.test.mjs`,
`src/lib/tools/toolIntegration.test.ts`, `src/lib/tools/benchmark.test.ts`,
`docs/OPENBENTT_PHASE_5_{TOOL_ARCHITECTURE,BENCHMARK,COMPLETION}.md`.

Migration version: 10. No commits or pushes made by this agent.

## 24. Known Limitations

1. `tsc` baseline red (54 pre-existing errors, unrelated files); Phase 5
   adds zero.
2. `connector.search` fetch semantics differ slightly by runtime (renderer:
   ≤3 SSRF-revalidated redirects; main: no redirects, fail-closed) —
   both SSRF-safe; documented.
3. Bulk benchmark uses a noop audit sink; SQLite/localStorage persistence
   cost not measured.
4. Document tools on desktop read the renderer registry (local mode);
   main-process document access is metadata-only by design.
5. No USER_INITIATED_WRITE/SYSTEM_INTERNAL tools registered yet; permission
   classes exist for Phase 6+.
6. Electron smoke/packaging runs not executed (headless).

## 25. Deferred Work

`project.update`, document ingest tools, retrieval/synthesis/citation tool
wrappings, retry budgets, MCP translation, and all of Phase 6 (agents).
Explicitly not built: agent loop, planner, reflection, autonomous retries,
goal decomposition, memory/browser/research/coding agents, MCP, shell/code/
browser tools.

## 26. Phase 6 Readiness

```
                    USER
                     |
                     v
               FUTURE AGENT
                     |
                     v
              TOOL REGISTRY (15 tools, static)
                     |
                     v
             POLICY ENGINE (ALLOW/DENY/CONFIRM)
                     |
                     v
              TOOL EXECUTOR (+ audit every step)
                     |
        +------------+------------+
        |            |            |
    Knowledge    Documents    Connectors (+project/export/utility)
        |            |            |
        +------------+------------+
                     |
                  Evidence → SourceRef
```

The boundary future agents cannot bypass: all capability access flows
through `toolApi.execute` / `research:tools execute` → registry → policy →
executor → existing services → audit. Agents get no direct SQLite, IPC,
connector, filesystem, or service access; adding one requires a registered
tool with declared capabilities, permission, risk, schemas, tests, and audit
— the extension guide (§19 of the architecture doc) makes this mechanical.
Confirmation-gated mutations (`connector.import`) give Phase 6 a ready-made
human-in-the-loop hook.
