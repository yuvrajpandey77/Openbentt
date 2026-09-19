# PHASE 9.5 MODEL STATE AUDIT

Date: 2026-09-17

## Executive Summary

**Root Cause**: Multiple independent model state sources exist with no synchronization. The sidebar shows the Ollama auto-selected model (`LocalAIContext.defaultModel`) while the chat system uses the persisted `ChatContext.apiConfig` which may have a completely different provider/model.

## Current Model State Architecture

### 1. ChatContext (`useChat()`) — **Authoritative for generation**
```typescript
apiConfig: {
  aiProvider: "openai_compatible" | "openrouter" | "webgpu_gemma" | ...
  model: "qwen3:0.6b" | "openai/gpt-oss-20b" | ...
  openAiCompatibleBaseUrl: "http://127.0.0.1:11434/v1"
  // ... other config
}
```
- Persisted to `localStorage["openbentt-api-config"]`
- Used by `streamChatForConfig` / `streamRoutedTask` for actual requests
- **This is what actually determines which model/provider responds**

### 2. LocalAIContext (`useLocalAI()`) — Ollama-specific state
```typescript
{
  defaultModel: "qwen3:0.6b" | null  // auto-selected from installed models
  preferredModel: "qwen3:0.6b" | null // user-set preference (localStorage)
  modelNames: ["qwen3:0.6b", "gemma3:1b", ...] // discovered from Ollama
  health: "ready" | "no-models" | ...
}
```
- `defaultModel` = `autoSelectOllamaModel(installed, preferredModel)`
- `preferredModel` persisted to `localStorage["openbentt-local-model-pref"]`
- **Independent from ChatContext.apiConfig**

### 3. LocalModelContext (`useLocalModels()`) — Legacy model manager
```typescript
{
  snapshot: ModelManagerSnapshot { registry: { ollama: [...], gguf: [...], webgpu: [...] } }
  configuredAvailability: ModelAvailability // based on apiConfig
}
```
- Builds snapshot from `buildModelManagerSnapshot(apiConfig)` (uses `probeOllamaModels` — OpenAI-compatible `/v1/models` only)
- **Separate Ollama probe path from LocalAIContext**

## Where Model State Is Displayed

| Component | Source | What It Shows |
|-----------|--------|---------------|
| `ModelPicker` | `useChat().apiConfig.model` + `useLocalAI().modelNames` | Current active model (from apiConfig) + available local models |
| `Sidebar LocalAIStatus` | `useLocalAI().defaultModel` | Auto-selected Ollama model |
| `AppChromeHeader` | `ModelPicker` + `LocalModelStatusBar` | Current model + local model count |
| `LocalModelStatusBar` | `useLocalModelsOptional().configuredAvailability` | Legacy availability check |
| `Settings LocalAICard` | `useLocalAI().defaultModel` + `useChat().apiConfig` | Ollama models with "In use" badge when apiConfig matches |
| `OnboardingFlow` | `useLocalAI().defaultModel` | Auto-selected model for first-run |

## The Bug: State Divergence

**Scenario**: User previously configured a cloud model (e.g., `openrouter` + `openai/gpt-oss-20b`), then installed Ollama with `qwen3:0.6b`.

**Result**:
- `ChatContext.apiConfig` = `{ aiProvider: "openrouter", model: "openai/gpt-oss-20b" }`
- `LocalAIContext.defaultModel` = `"qwen3:0.6b"` (auto-selected from Ollama)
- `LocalAIContext.preferredModel` = `null` (never explicitly set)

**What user sees**:
| UI Element | Shows | Source |
|------------|-------|--------|
| ModelPicker button | "gpt-oss-20b · Cloud" | `apiConfig.model` |
| ModelPicker dropdown local section | "Qwen3 0.6B ✓ Active" (if `apiConfig.model === "qwen3:0.6b"`) | Compares `apiConfig.model` to local names |
| Sidebar status | "Qwen3 0.6B" | `LocalAIContext.defaultModel` |
| Settings LocalAICard | "Qwen3 0.6B" with "In use" badge only if `apiConfig.model === "qwen3:0.6b"` | Checks `apiConfig.model` |

**Critical finding**: The sidebar shows `defaultModel` (auto-selected) while the ModelPicker shows `apiConfig.model` (actual configured). These are **independent state machines**.

## Why This Happened

1. **Phase 9 introduced LocalAIContext** for Ollama management but didn't unify it with existing `ChatContext.apiConfig`
2. **ModelPicker** correctly uses `apiConfig` as source of truth for "what is active"
3. **Sidebar LocalAIStatus** incorrectly uses `LocalAIContext.defaultModel` as "what is active"
3. **Settings LocalAICard** tries to reconcile by checking `apiConfig.model` against local models, but still shows `defaultModel` as "Default preference"
4. **No synchronization** when:
   - User changes provider/model in Settings → updates `apiConfig` but not `LocalAIContext.preferredModel` consistently
   - User selects local model in ModelPicker → updates BOTH `apiConfig` AND `LocalAIContext.preferredModel`, but this is the ONLY sync point
   - App restarts with persisted `apiConfig` → `LocalAIContext` re-auto-selects based on `preferredModel` (which may be null)

## State Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      USER ACTION                            │
│         (Select model in ModelPicker / Settings)            │
└─────────────────────┬───────────────────────────────────────┘
                      ▼
         ┌─────────────────────────────┐
         │    ModelPicker.selectLocalModel()    │
         │  1. setPreferredModel(name) ──► LocalAIContext.preferredModel
         │  2. setApiConfig({...openai_compatible, model:name}) ──► ChatContext.apiConfig
         └──────────────┬──────────────────────┘
                        ▼
         ┌─────────────────────────────┐
         │         PERSISTENCE         │
         │  localStorage["openbentt-api-config"] = apiConfig
         │  localStorage["openbentt-local-model-pref"] = preferredModel
         └──────────────┬──────────────────────┘
                        ▼
         ┌─────────────────────────────┐
         │       APP RESTART           │
         │  1. ChatContext loads apiConfig from localStorage
         │  2. LocalAIContext loads preferredModel from localStorage
         │  3. LocalAIContext computes defaultModel = autoSelect(modelNames, preferredModel)
         │     → If preferredModel is null, auto-selects first usable model
         │     → If preferredModel exists but model deleted, falls back to auto
         └──────────────┬──────────────────────┘
```

## The Fix: Single Source of Truth

**Principle**: `ChatContext.apiConfig` is the authoritative model state. All UI must derive "active model" from it.

### Required Changes

1. **LocalAIContext** should expose `effectiveLocalModel` derived from `apiConfig` when provider is `openai_compatible`
2. **Sidebar LocalAIStatus** should use the effective model from `apiConfig` (via ChatContext) not `defaultModel`
3. **ModelPicker** already does this correctly — keep as reference implementation
4. **Settings LocalAICard** should show "Active model" from `apiConfig` not `defaultModel`
5. **OnboardingFlow** should set `apiConfig` directly, not just `preferredModel`
6. **LocalModelStatusBar** should use `apiConfig` for active model display

### Implementation Strategy

Create a new hook `useEffectiveModel()` that:
- Takes `apiConfig` and `LocalAIContext` state
- Returns the true active model with provider/location metadata
- Used by ALL UI components

Or simpler: Make `LocalAIContext` consume `useChat()` to read `apiConfig` and expose a unified `activeModel` that all components use.

## Files to Modify

| File | Change |
|------|--------|
| `src/context/LocalAIContext.tsx` | Add `useChat()` dependency, compute `activeModel` from `apiConfig` when provider is `openai_compatible` |
| `src/components/LocalAIStatus.tsx` | Use `activeModel` from LocalAIContext instead of `defaultModel` |
| `src/components/ModelPicker.tsx` | Already correct — verify |
| `src/pages/SettingsPage.tsx` | Use `activeModel` for "In use" badge |
| `src/components/OnboardingFlow.tsx` | Set `apiConfig` directly via `useChat().setApiConfig()` |
| `src/components/LocalModelStatusBar.tsx` | Migrate to use `apiConfig` or new unified hook |

## Test Cases for Verification

1. **Fresh install + Ollama with qwen3:0.6b** → Sidebar = ModelPicker = "Qwen3 0.6B Local"
2. **Existing user with cloud model + Ollama installed** → Sidebar = ModelPicker = cloud model (until user switches)
3. **Switch local → cloud in ModelPicker** → Both update immediately
4. **Switch cloud → local in ModelPicker** → Both update immediately  
5. **App restart** → Selection persists correctly
6. **Ollama model deleted externally** → UI shows unavailable, falls back gracefully
7. **Provider failure** → No silent fallback, explicit error

## Live Verification Required

- [ ] Real Ollama with installed model → verify UI matches actual generation
- [ ] Real OpenRouter/OpenAI → verify cloud model shown correctly
- [ ] Model switch during generation → verify no race condition