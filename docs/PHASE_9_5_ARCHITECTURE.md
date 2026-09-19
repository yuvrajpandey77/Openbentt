# PHASE 9.5 ARCHITECTURE — Unified Model State

## Overview

This document describes the model state architecture after Phase 9.5 fixes. The key change is the introduction of a **single authoritative model state** (`ChatContext.apiConfig`) with a **derived unified view** (`LocalAIContext.effectiveModel`) consumed by all UI components.

## State Hierarchy

```
┌────────────────────────────────────────────────────────────────────┐
│                      CHATCONTEXT (Source of Truth)                 │
│  apiConfig: ApiKeyConfig                                           │
│  ├── aiProvider: "openrouter" | "openai_compatible" | ...         │
│  ├── model: string                                                 │
│  ├── openAiCompatibleBaseUrl: string                               │
│  └── ... (keys, research config, etc.)                             │
│  • Persisted: localStorage["openbentt-api-config"]                 │
│  • Used by: streamChatForConfig, streamRoutedTask                  │
└──────────────────────────┬─────────────────────────────────────────┘
                           │
                           ▼ (read-only derivation)
┌────────────────────────────────────────────────────────────────────┐
│                    LOCALAICONTEXT (Derived View)                   │
│  State (local):                                                    │
│  ├── status: OllamaStatus (from IPC /api/tags, /api/ps)           │
│  ├── modelNames: string[] (installed Ollama models)               │
│  ├── runningModels: string[] (currently loaded)                   │
│  ├── preferredModel: string | null (localStorage)                 │
│  └── auto: autoSelectOllamaModel(modelNames, preferredModel)      │
│                                                                    │
│  Derived (useMemo):                                                │
│  ├── effectiveModel = buildEffectiveModel(apiConfig, localState)  │
│  └── health: "checking" | "ready" | "no-models" | ...             │
└──────────────────────────┬─────────────────────────────────────────┘
                           │
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
    ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
    │  Sidebar     │ │ ModelPicker  │ │  Settings    │
    │ LocalAIStatus│ │ (unchanged)  │ │ LocalAICard  │
    │ (consumes    │ │ (already     │ │ (now uses    │
    │ effective)   │ │  correct)    │ │ effective)   │
    └──────────────┘ └──────────────┘ └──────────────┘
```

## `buildEffectiveModel()` — Pure Function

**Location**: `src/context/LocalAIContext.tsx`

**Signature**:
```typescript
function buildEffectiveModel(
  apiConfig: ApiKeyConfig,
  localAI: { defaultModel, defaultReason, modelNames, runningModels, status, health, preferredModel }
): EffectiveModel | null
```

**Logic Flow**:
```
1. If provider ∈ ["openrouter","openai_direct","anthropic","google"]
   → Cloud model: use apiConfig.model directly
   → provider="cloud", location="cloud", source="explicit"

2. If provider === "openai_compatible"
   → Check if loopback (127.0.0.1, localhost, [::1])
   → If local: available = modelNames.includes(model) || runningModels.includes(model)
   → provider="openai_compatible", location=local?"local":"cloud"
   → source = preferredModel===model ? "explicit" : defaultReason==="explicit-preference" ? "persisted" : "fallback"

3. If provider === "webgpu_gemma"
   → On-device: provider="webgpu", location="local", source="explicit"

4. If provider === "local_gguf"
   → GGUF: provider="gguf", location="local", source="explicit"

5. Else (no provider configured)
   → Fall back to localAI.defaultModel if exists
   → provider="ollama", location="local", source=defaultReason==="explicit-preference"?"explicit":"auto"
```

## EffectiveModel Type

```typescript
export interface EffectiveModel {
  modelId: string | null;           // The actual model ID sent to provider
  displayName: string;              // Human-readable (e.g., "Qwen3 0.6B")
  provider: "ollama" | "openai_compatible" | "cloud" | "webgpu" | "gguf" | null;
  location: "local" | "cloud" | null;
  available: boolean;               // Ready to use
  source: "explicit" | "auto" | "fallback" | "persisted";
}
```

## Data Flow: Model Selection

### User Action: Select Model in ModelPicker
```
1. User clicks model in dropdown
2. ModelPicker.selectLocalModel(name)
   ├── setPreferredModel(name) ──────► LocalAIContext.preferredModel
   ├── setApiConfig({                ───► ChatContext.apiConfig
       aiProvider: "openai_compatible",
       model: name,
       openAiCompatibleBaseUrl: ...
     })
   └── Both persist to localStorage
3. LocalAIContext recomputes effectiveModel (via useMemo deps)
4. All consumers (Sidebar, Settings, Header) re-render with new effectiveModel
```

### App Restart
```
1. ChatContext loads apiConfig from localStorage
2. LocalAIContext loads preferredModel from localStorage
3. LocalAIContext computes auto = autoSelectOllamaModel(modelNames, preferredModel)
4. buildEffectiveModel(apiConfig, localState) → effectiveModel
5. UI renders with consistent model immediately
```

## Persistence Keys

| Key | Scope | Description |
|-----|-------|-------------|
| `openbentt-api-config` | Global | Full `ApiKeyConfig` — provider, model, keys, research config |
| `openbentt-local-model-pref` | Local AI | User's explicit local model choice (input to auto-selection) |
| `openbentt-onboarding-v1` | Onboarding | State machine state + completed flag |

## Provider Resolution Matrix

| apiConfig.aiProvider | apiConfig.openAiCompatibleBaseUrl | Effective Location | Notes |
|---------------------|-----------------------------------|-------------------|-------|
| `openrouter` | — | cloud | Requires API key |
| `openai_direct` | — | cloud | Requires API key |
| `anthropic` | — | cloud | Requires API key |
| `google` | — | cloud | Requires API key |
| `openai_compatible` | `http://127.0.0.1:11434/v1` | local | Ollama / LM Studio loopback |
| `openai_compatible` | `http://localhost:11434/v1` | local | Ollama / LM Studio loopback |
| `openai_compatible` | `https://api.x.ai/v1` | cloud | Grok / other compatible |
| `webgpu_gemma` | — | local | On-device WASM/WebGPU |
| `local_gguf` | — | local | llama-server binary |

## Auto-Selection Algorithm

**Location**: `src/lib/ollama/selection.ts` → `autoSelectOllamaModel()`

```typescript
1. If preferredModel exists in installed models → return it ("explicit-preference")
2. Filter out embedding models (nomic-embed, bge, e5, gte, mxbai)
3. Score remaining: instruct bonus + small params + known family bonus
4. Return top-scoring → "auto-discovered"
5. If none usable → return null ("no-usable-model")
```

**Scoring**:
- Instruct/chat models: -500
- Known families (qwen3, smollm2, gemma3, llama3, phi4, mistral): -50
- Params ≤ 4B: +params × 20, else +params × 100
- Unknown size: +400

## Health States

| Health | Condition | UI Indication |
|--------|-----------|---------------|
| `checking` | Initial load, no status yet | Spinner |
| `ready` | Ollama reachable + usable model exists | Green dot |
| `no-models` | Ollama reachable but no chat models | Amber dot |
| `unavailable` | Ollama installed but not reachable | Red dot |
| `unsupported` | Not desktop / Ollama not installable | Gray dot |

## UI Consumption Patterns

### Sidebar (`LocalAIStatus`)
```tsx
const { effectiveModel, health, checking, error, activePulls } = useLocalAI();
// Shows: effectiveModel?.displayName + " · " + effectiveModel?.location
// Green dot when effectiveModel?.available
```

### ModelPicker (Already Correct)
```tsx
const { apiConfig } = useChat();  // Uses apiConfig.model directly
const { modelNames } = useLocalAI();  // For available local models list
```

### Settings (`LocalAICard`)
```tsx
const { effectiveModel } = useLocalAI();
// "In use" badge: effectiveModel?.modelId === m.name
```

### Header (AppChromeHeader)
```tsx
// ModelPicker already in header
// LocalModelStatusBar uses legacy LocalModelContext (unchanged)
```

## Testing Strategy

### Unit Tests (Vitest)
- `src/lib/ollama/selection.test.ts` — auto-selection logic
- `src/lib/onboarding/stateMachine.test.ts` — onboarding transitions

### Integration Tests (Node)
- `electron/ollamaService.test.mjs` — IPC allowlist, progress parsing, ranking

### Regression Tests Needed (Future)
1. `effectiveModel` matches `apiConfig` after ModelPicker selection
2. `effectiveModel` persists across app restart
3. Switch local → cloud → local maintains consistency
4. Deleted external model → `available: false` in effectiveModel
5. No silent fallback to cloud when local fails

## Performance Characteristics

- `effectiveModel` computed via `useMemo` with `[apiConfig, localAIState]` dependencies
- Only recomputes when `apiConfig` changes (user action) or local AI state changes (Ollama status poll)
- No additional context providers or re-renders
- Streaming path (`ChatContext.sendMessage`) unchanged — reads `apiConfig` directly

## Security Boundaries

- `LocalAIContext` only **reads** `apiConfig` via `useChat()` — no write access
- Ollama IPC: loopback-only origin validation, model name allowlist
- No shell execution, no arbitrary binary download
- Phase 5–8 boundaries untouched (tool registry → runtime → connectors → action gate)