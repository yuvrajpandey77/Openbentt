# Openbentt Phase 6 — Agent Architecture

Controlled agent runtime on the Phase 5 tool substrate. One general runtime,
one built-in configuration (`research-assistant`); role agents later layer as
configurations. No planner, no reflection, no memory agents, no MCP.

## 1. Runtime shape

`src/lib/agent/` (renderer-side, framework-free except chat wiring):

- `agentTypes.ts` — AgentRequest/Context/State/Step/ToolCall/ToolResult/
  AgentDecision/AgentRun/AgentError-shape/Definition/ModelFn/Activity.
- `agentErrors.ts` — 12 structured kinds (AGENT_TIMEOUT/STEP_LIMIT/
  TOOL_LIMIT/TOOL_DENIED/CONFIRMATION_REQUIRED/INVALID_INPUT/FAILED,
  MODEL_FAILURE, CONTEXT_LIMIT/OUTPUT_LIMIT, PROJECT_SCOPE_FAILURE,
  RUN_CANCELLED).
- `agentDefinitions.ts` — `research-assistant` (15-tool allowlist, task
  `chat_lightweight`, system policy, limits: 8 steps / 6 tools / 120s run /
  4k request / 8k final / 24k context / 12k observations).
- `agentPrompt.ts` — system builder, registry projection (no schema
  duplication), strict proposal parser, DATA wrappers.
- `agentRuntime.ts` — single `driveLoop` used by fresh + resumed runs;
  in-memory registry (50 runs); suspend/resume; run audit events.
- `agentModel.ts` — default model fn via `streamRoutedTask` (existing
  abstraction, all providers incl. local); silent reasoning collection.
- `agentTools.ts` — default executor (`toolApi.execute`) + audit sink
  (`toolApi.record` → SQLite, localStorage fallback).
- `agentChat.ts` — trace mapping, source mapping, chunked final emission,
  confirmation prompt.
- `index.ts` — barrel.

## 2. Bounded loop

```
request → validate → run state → LOOP:
  budget checks (time/steps) → assemble context (newest-first DATA obs)
  → model (raced against remaining budget) → strict parse
  → FINAL: complete (truncate-noted) | TOOL: validate → scope → execute
    → CONFIRM: suspend | DENY/fail: observation, continue | ok: observation
→ audit start/finish/suspend
```

One attempt per tool call (no retry loop); the model may choose a different
tool next step — that is reasoning, not retry. Abort signals cancel between
and during model calls. Limits fail closed with structured kinds.

## 3. Model protocol

Text protocol (model-agnostic, no function-calling API assumed):
` ```tool {"tool": id, "input": {...}} ` (last valid block wins, 5-block scan
budget) or `FINAL: <answer>`. Anything else is final. Model context: system
policy + trust rules + projected tool list + request + wrapped observations
(24k cap, oldest dropped first).

## 4. Limits

8 steps, 6 tool calls, 120s run (enforced during model calls via race),
30s per-tool (Phase 5 timeout), 4k request, 8k final (truncate-noted), 24k
context, 12k observations (12 newest), 50 stored runs. All fail closed.

## 5. State

`AgentRun`: ids, request, agentId, status
(running/awaiting_confirmation/completed/failed/cancelled), steps (safe
labels only), tool-call records, bounded DATA observations, optional
finalText/error/pendingConfirmation, model route, timestamps. IDs + summaries
only — no document duplication, no secrets.

## 6. Chat integration

Additive `ChatContext` methods (`agentMode` persisted, `sendAgentMessage`,
`confirmAgentRun`, `pendingAgentConfirm`, `registerAgentProjectProvider`
wired to the active research project); user/assistant messages reuse existing
state, title updates, chat-log persistence, and abort registry. Agent toggle
in ChatInput extras; confirmation block in ChatMessages linked by
`message.agentRunId`; activity via the existing `agentTrace` collapsible;
sources via `researchSources`; final streams in bounded chunks. Standard
pipeline untouched.

## 7. Electron integration

Zero new channels except additive `research:tools/record` → existing
`recordToolAuditEvent` (no new table). Preload unchanged. Local-only tools
still never cross IPC. Renderer cannot bypass policy (verified by test:
`agent.run` is not a tool and execution denies it).

## 8. Extension

New capability = registered Phase 5 tool + allowlist entry + tests. New
agent = `AgentDefinition` (id/name/tools/task/policy/limits). MCP later =
translate calls into this registry, never around it.
