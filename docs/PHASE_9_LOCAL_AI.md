# PHASE 9 LOCAL AI — Ollama-First Desktop Integration

## 1. Design Principle

**Default local provider = Ollama** (spec §31/§45)

| Tier | Provider | UX |
|------|----------|-----|
| Primary | Ollama | Auto-detect → auto-select → background download → ready |
| Advanced | GGUF / llama.cpp | Settings → AI & Models → "Local file model" (manual) |

Ordinary users never see GGUF paths, binary config, or CLI commands.

## 2. Main Process Service (`electron/ollamaService.mjs`)

### Security (Loopback-Only)
```javascript
export function normalizeOllamaOrigin(raw) {
  // Only http://127.0.0.1:11434 or http://localhost:11434 or http://[::1]:11434
  // Rejects: https, remote hosts, auth in URL, non-standard ports
}

export function assertOllamaModelName(raw) {
  // Allowlist: /^[a-zA-Z0-9][a-zA-Z0-9._\-/:]{0,127}$/
  // Rejects: shell metachars (; & | ` $ \n \0 ..)
}
```

### IPC Surface (6 narrow channels)
| Channel | Purpose |
|---------|---------|
| `ollama:status` | `/api/version` + `/api/tags` + `/api/ps` |
| `ollama:listModels` | Installed + running models |
| `ollama:pullModel` | Fire-and-forget `/api/pull` |
| `ollama:cancelPull` | Abort in-progress pull |
| `ollama:installInfo` | Platform steps + official download URL |
| `ollama:recommendedModels` | Curated compact instruct models |

### Real Pull Progress
- Streams `/api/pull` NDJSON via `fetch`
- Parses per-digest `completed`/`total` → aggregates percent
- Emits `ollama:pullProgress` events: `{ model, state, percent, completed, total, detail }`
- States: `queued` → `downloading` → `verifying` → `ready` / `failed` / `cancelled`

### Installer Flow (No Silent Exec)
1. `installInfo` returns `{ platform, supported, downloadUrl: "https://ollama.com/download", steps }`
2. UI opens URL via `openbenttDesktop.openExternal` (or `window.open`)
3. User installs manually, clicks "Check again"
4. App re-runs `ollama:status` — verifies API reachable

## 3. Renderer Orchestration (`src/context/LocalAIContext.tsx`)

### Detection Flow
```typescript
// Desktop: native IPC
const s = await api.status();  // { reachable, version, models[], runningModels[] }

// Web fallback: OpenAI-compatible probe
const probe = await probeOllamaModels(baseUrl);  // /v1/models only
```

### Auto-Selection (`src/lib/ollama/selection.ts`)
```typescript
// 1. Explicit preference wins if still installed
// 2. Filter embedding models (nomic-embed, bge, e5, gte)
// 3. Score: instruct bonus + small params + known family
// 4. Return top or null (triggers setup flow)
```

### Background Download
```typescript
// Fire-and-forget — UI stays responsive
await api.pullModel(name);
// Progress arrives via onPullProgress → TaskCenter + activePulls state
```

### Resilience
- 30s poll for external Ollama start/stop
- Pull progress survives renderer reload (main process continues)
- Cancel supported via `ollama:cancelPull`

## 4. Onboarding Integration (`src/components/OnboardingFlow.tsx`)

| Step | State | Action |
|------|-------|--------|
| Env check | `ENVIRONMENT_CHECK` | `LocalAIContext.refresh()` |
| Ollama found | `OLLAMA_FOUND` | → `MODEL_DISCOVERY` |
| Ollama missing | `OLLAMA_MISSING` | → `OLLAMA_CHECK` (install UI) |
| Models found | `MODEL_DISCOVERY` → `MODEL_FOUND` | Auto-select → "Use model" |
| No models | `MODEL_DISCOVERY` → `MODEL_NEEDED` | → `MODEL_SETUP` (download UI) |
| Download done | `MODEL_SETUP` → `MODEL_READY` | → `READY` → Chat |

## 5. Settings Integration (`src/pages/SettingsPage.tsx` → `LocalAICard`)

- Real-time status badge: Ready / Checking / No models / Unavailable
- Model list: name, size, quantization, running indicator, "Use" / "Preferred"
- Download buttons: recommended models + custom name input
- Progress bar per model (from `activePulls`)
- "Check connection" button → `refresh()`

## 6. Model Picker (`src/components/ModelPicker.tsx`)

- Global default scope (honestly labeled)
- Sections: "Local · Ollama" (discovered) + "Current cloud model"
- Switching to local configures existing `openai_compatible` path
- No new inference backend, no policy bypass

## 7. Testing

| Test | File | Coverage |
|------|------|----------|
| Origin allowlist | `ollamaService.test.mjs` | Loopback only, rejects remote |
| Model name allowlist | `ollamaService.test.mjs` | Rejects shell injection |
| Progress aggregation | `ollamaService.test.mjs` | Per-digest totals, percent |
| Model ranking | `ollamaService.test.mjs` | Small instruct first, embeddings last |
| Install info | `ollamaService.test.mjs` | Official URL, platform steps |
| Auto-selection | `selection.test.ts` | Preference, fallback, embeddings excluded |
| Onboarding transitions | `stateMachine.test.ts` | Happy path, missing Ollama, local-only |

## 8. Zero-Mock Verification

| Feature | Real Implementation |
|---------|---------------------|
| Ollama reachability | `fetch("http://127.0.0.1:11434/api/version")` |
| Model listing | `fetch("/api/tags")` → parse `models[]` |
| Running models | `fetch("/api/ps")` → parse `models[].name` |
| Model download | `POST /api/pull` with `stream: true` → NDJSON |
| Progress | Parsed from Ollama events — never `setInterval` fake % |
| Readiness | Verified by re-querying `/api/tags` after pull |
| Installer | Opens `https://ollama.com/download` — no binary download |

## 9. Live Verification Matrix

| Scenario | Expected |
|----------|----------|
| Ollama running, models installed | Health = "ready", models listed, auto-select works |
| Ollama running, no models | Health = "no-models", download UI offered |
| Ollama installed but stopped | Health = "unavailable", "Check connection" works |
| Ollama not installed | Health = "unavailable", Install UI opens official URL |
| Pull qwen3:1.7b | Progress events → 100% → TaskCenter "done" → model in list |
| Cancel pull | State = "cancelled", no partial model left |
| Network failure mid-pull | State = "failed", retry button works |
| App restart during pull | Main process continues; renderer reconnects to progress |

## 10. GGUF / llama.cpp (Advanced — Unchanged)

- Settings → AI & Models → Provider "Local file model"
- Requires: `llama-server` binary, HF token (OS-encrypted), downloaded GGUF
- Runs on `127.0.0.1` only
- Phase 9 does not modify this pipeline — preserved as-is behind Advanced