# Phase 6 Complete

## 1. Executive summary

Phase 6 implements a controlled agent runtime on the Phase 5 tool substrate:
a bounded loop (request → scoped context → model proposal → strict parse →
allowlist/registry/scope checks → Phase 5 execute → bounded DATA observation
→ final), one built-in `research-assistant` configuration, model access
exclusively through the existing `streamRoutedTask` abstraction, chat
integration via additive ChatContext methods, and confirmation-gated
mutations that the model can never self-approve. No planner, reflection,
memory agents, MCP, shell/code/browser tools, retries, or new dependencies.
All 22 security tests pass; full regression is green against the Phase 5
baseline.

## 2. What existed before

Phases 0–5: chat (pipeline, 7 providers, streaming, RAG auto-context),
documents/knowledge/connectors services, 15 static tools with deterministic
policy and audit, SQLite v10, allowlisted IPC, ToolPanel. No agent loop,
planner, MCP, or autonomous behavior (forensically verified; see
`OPENBENTT_PHASE_6_PREIMPLEMENTATION.md`).

## 3. What was implemented

- `src/lib/agent/`: types, 12-kind errors, prompt protocol, 1 definition,
  bounded runtime, model wrapper, tool/audit wiring, chat helpers, barrel
  (8 modules + 4 test files).
- Chat: `agentMode` + `sendAgentMessage` + `confirmAgentRun` +
  `pendingAgentConfirm` + project-id provider (ChatContext, additive);
  Agent toggle (ChatInput extras); confirmation block (ChatMessages);
  `agentRunId` link field (Message type); project provider registration
  (ResearchProjectContext).
- Electron: additive `research:tools/record` op → existing ledger;
  `toolApi.record`; `agentAudit.test.mjs`; test-manifest entry.

## 4. Exact architecture

See `OPENBENTT_PHASE_6_ARCHITECTURE.md`. Single `driveLoop` serves fresh and
resumed runs; injected `{model, executeTool}` deps (stubbable); default model
is `streamRoutedTask(chat_lightweight)`; default executor is
`toolApi.execute`; run events reuse the Phase 5 audit sink.

## 5. Agent lifecycle

running → (completed | failed | cancelled | awaiting_confirmation →
resumed → …). Suspended runs persist in a bounded in-memory registry (50);
mismatched/expired confirmations throw; abort cancels between and during
model calls (budget race).

## 6. Tool lifecycle

Model text → last-valid-fenced-block parse → allowlist → registry → scope
force/check → Phase 5 executor → CONFIRM suspends / DENY-fail observed /
ok observed (bounded, DATA-wrapped, newest-first budgeted). One attempt per
call; no retries.

## 7. Security model

See `OPENBENTT_PHASE_6_SECURITY.md` (guarantee table + trust zones +
residual risks). Headline: policy never reads tool output; confirmations
never originate from the model; scope never originates from the model.

## 8. Prompt injection defense

DATA markers + system rules + structural guarantees; tests prove injected
directives/approvals/privilege claims in document and connector results
cause no privileged action and no confirmation bypass.

## 9. Permission model

Inherited unchanged from Phase 5 (14× READ_ONLY, 1× USER_CONFIRMATION).
Agent adds no permission classes and cannot mint capabilities.

## 10. Confirmation model

Suspend with `pendingConfirmation{toolId, requestId, summary}` →
amber UI block bound by `agentRunId` → `confirmAgentRun` →
`resumeAgentRun` with exact-tool match → re-proposal executes under bound
confirmation → continuation streams into the same message.

## 11. Chat integration

Agent toggle routes sends to `sendAgentMessage` (attachments fall back to
standard send); activity streams into the existing `agentTrace` collapsible;
sources into `researchSources`; final streams chunked; title/chat-log/abort
behavior mirrors the standard pipeline. Standard pipeline untouched.

## 12. Electron integration

Renderer-side runtime; no new channels except `record` (validated ledger
insert); preload unchanged; local-only tools still IPC-proof; `agent.run`
is audit-only and execution-denying (tested both sides).

## 13. Persistence

Runs in memory; durability via tool audit rows (`agent:<runId>` source),
`agent.run` start/finish/suspend events, chat messages (content + trace +
sources), and existing chat-log persistence. No new tables, no migration.

## 14. Audit behavior

Every run emits start/finish (and suspend) events through the Phase 5 sink
with run/step/tool-call counts; every tool call audited as before with agent
source tags; secret-shaped content verified absent; expired-run and mismatch
cases covered.

## 15. Tests

- `agentPrompt.test.ts` (10): protocol parsing incl. adversarial shapes,
  projection fail-closed, DATA bounds.
- `agentRuntime.test.ts` (21): loop, allowlist/registry/scope, confirmation
  integrity + fake-approval rejection, step/tool/timeout/abort/output-limit,
  injection containment ×3, audit hygiene, activity isolation, model failure.
- `agentIntegration.test.ts` (3): real-executor research chain with sources
  + audit linkage; real-policy import suspend→confirm→resume→entity;
  denied-tool recovery.
- `electron/agentAudit.test.mjs` (1): record persistence, allowlist intact,
  `agent.run` non-executability, store parity.
- `benchmark.test.ts` (1): overhead figures below.
- Phase 5 suites untouched and green (444+1 vitest).

## 16. Benchmark results

See `OPENBENTT_PHASE_6_BENCHMARK.md`: prompt assembly 16.8ms/1000, parsing
0.9ms/1000, no-tool run median 0.02ms p95 0.11ms, 2-tool run median 0.02ms
p95 0.33ms (model stubbed; production latency = provider + tools, per
Phase 5 figures).

## 17. Files changed

ADD: `src/lib/agent/*` (13 files), `electron/agentAudit.test.mjs`,
4 Phase 6 docs. MODIFY (additive): `src/context/ChatContext.tsx`
(agentMode/sendAgentMessage/confirmAgentRun/pendingAgentConfirm/project
provider), `src/components/ChatInput.tsx` (toggle + send branch),
`src/components/ChatMessages.tsx` (confirmation block),
`src/context/ResearchProjectContext.tsx` (provider registration),
`src/types/chat.ts` (`agentRunId?`), `src/lib/tools/toolApi.ts`
(`record`), `electron/researchProjectService.mjs` (`record` op),
`package.json` (test entry). No commit/push performed.

## 18. Files intentionally untouched

RAG constants/pipeline, Phase 2 services/stores, Phase 3
identity/extract/validation/traversal/stores, Phase 4
normalize/identity/import/stores, Phase 5
registry/policy/executor/toolStore logic, standard chat pipeline, streaming
transports, migrations v1–v10, CSP/secrets/SSRF, exporters, citation/
synthesis modules, ToolPanel.

## 19. Dependencies added

None. Zero new npm dependencies.

## 20. Known limitations

1. tsc baseline still 54 pre-existing errors (unrelated files); Phase 6
   adds zero (two transient errors fixed during work).
2. Model protocol is text-based; non-conforming models yield direct answers
   with no tool use (safe degradation, not an error).
3. Run registry is in-memory; reload loses suspended runs (durable trail is
   audit + chat).
4. Document chunk text available to the agent only via tool snippets
   (bounded by design).
5. Electron smoke/packaging not executed (headless, as in Phases 4–5).
6. Two ResearchProjectContext eslint warnings pre-exist at HEAD (verified).

## 21. Deferred work

Role agents (configurations welcome), planner/reflection/memory, MCP
translation, retry budgets, `project.update`, document-ingest tools,
retrieval/synthesis/citation wrappers, shell/code/browser/email tools —
all still out, none scaffolded.

## 22. Phase 7 readiness

Phase 7 (whatever orchestration comes next) inherits: a policy-first
substrate where new capability = registered tool + allowlist entry + tests;
per-agent configurations (id/tools/task/policy/limits); confirmation and
audit hooks already UI-wired; and a proven pattern (this phase) for adding
runtime power without moving the security boundary.

## 23. Exact commands executed

- `npx vitest run` → 103 files passed, 479 passed + 1 skipped.
- `npm run test:electron` → 97 passed, 0 failed.
- `npx tsc --noEmit -p tsconfig.app.json` → 54 errors (all pre-existing;
  `grep` proves none in agent/chat/tools/electron paths).
- `npx eslint <phase-6 paths>` → 0 errors (remaining warnings pre-existing).
- `npm run build` → pass; `npm run test:csp` → OK; `npm run
  lint:electron-security` → pass; `npm run lint:electron-pack` → pass.
- `npx playwright test` → 5 passed, 4 skipped (baseline-identical).
- `grep` audits: no protected-path diffs; no agent/MCP/loop/shell code.

## 24. Exact test results

| Suite | Result |
|---|---|
| vitest (all) | 103 files, 479 passed, 1 skipped |
| agent unit (prompt+runtime) | 31 passed |
| agent integration | 3 passed |
| agent benchmark | 1 passed |
| electron (all incl. agentAudit) | 97 passed, 0 failed |
| Playwright | 5 passed, 4 skipped |
| tsc | 54 pre-existing, 0 new |
| eslint (Phase 6 paths) | 0 errors |

PHASE 6 COMPLETE. The model proposes; the runtime validates; the policy
decides; the executor executes; the audit records; the user confirms.
