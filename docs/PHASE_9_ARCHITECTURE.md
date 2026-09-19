# PHASE 9 ARCHITECTURE — Openbentt Unified Desktop Shell

## 1. High-Level Structure

```
┌─────────────────────────────────────────────────────────────────┐
│                    Openbentt Application                         │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────────────────────────────────────────┐  │
│  │ Sidebar  │  │              Main Workspace                   │  │
│  │          │  │                                                │  │
│  │ Search   │  │  ┌────────────────────────────────────────┐   │  │
│  │ New Chat │  │  │ AppChromeHeader (ModelPicker, Share)   │   │  │
│  │ Chat     │  │  ├────────────────────────────────────────┤   │  │
│  │ Projects │  │  │                                        │   │  │
│  │ Library  │  │  │        Workspace Content               │   │  │
│  │ Notebook │  │  │                                        │   │  │
│  │ More ▼   │  │  │  ChatHome / ChatMessages / Project...  │   │  │
│  │          │  │  │                                        │   │  │
│  │ Local AI │  │  ├────────────────────────────────────────┤   │  │
│  │ ● Ready  │  │  │ ChatInput (Composer, Attachments, Tools)│  │  │
│  │ Account  │  │  └────────────────────────────────────────┘   │  │
│  └──────────┘  └──────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│  Global Overlay: CommandMenu (⌘K) | TaskCenterToasts            │
└─────────────────────────────────────────────────────────────────┘
```

## 2. Routing Architecture

| Route | Shell | Description |
|-------|-------|-------------|
| `/` | Marketing (web) / Chat (desktop) | Entry point |
| `/chat` | `AppLayout` | Primary chat surface |
| `/projects` | `AppShell` → `ProjectsHubPage` | Full-screen project studio |
| `/notebook` | `AppShell` → `NotebookStudioPage` | Full-screen notebook studio |
| `/labs` | `AppLayout` | Library / Research workspace (split pane) |
| `/settings` | `AppLayout` | Settings with unified panels |
| `/setup` | `AppShell` | Provider setup (legacy, redirected) |
| `/welcome` | `AppShell` | First-run onboarding flow |
| `/auth` | `AppShell` | Clerk sign in / sign up |

## 3. Provider Stack (src/App.tsx)

```
ErrorBoundary
  QueryClientProvider
    ThemeProvider
      AuthProvider (Clerk)
        OnboardingProvider
          TooltipProvider
            Toaster + Sonner
              BrowserRouter
                DesktopAppFrame
                  Suspense
                    Routes
                      Public routes (/, /download, /share)
                      Authenticated routes:
                        ChatProvider
                          LocalModelProvider
                            ResearchProjectProvider
                              ZoteroProvider
                                TaskCenterProvider
                                  LocalAIProvider
                                    Outlet
```

## 4. New Contexts Added (Phase 9)

### AuthContext (`src/context/AuthContext.tsx`)
- **Purpose**: Real Clerk authentication, publishable-key-only in renderer
- **State**: `unconfigured` | `loading` | `signed-out` | `signed-in`
- **User**: `{ id, displayName, email, avatarUrl }` or `null`
- **No secret keys in renderer**; Electron-safe flow via Clerk's browser-based OAuth

### OnboardingContext (`src/context/OnboardingContext.tsx`)
- **Purpose**: Persisted state machine for first-run flow
- **States**: `FIRST_LAUNCH` → `AUTH_REQUIRED` → `AUTHENTICATING` → `AUTHENTICATED` → `ENVIRONMENT_CHECK` → `OLLAMA_CHECK` → `MODEL_DISCOVERY` → `MODEL_SETUP` → `READY`
- **Also**: `RESUME_EXISTING_USER`, `LOCAL_ONLY`
- **Persistence**: `localStorage["openbentt-onboarding-v1"]` → survives restarts/crashes

### TaskCenterContext (`src/context/TaskCenterContext.tsx`)
- **Purpose**: Single global background-task surface (model downloads, Ollama setup, connector sync, exports, etc.)
- **Task**: `{ id, kind, title, detail, percent, state, error, onCancel, onRetry, onOpen }`
- **State**: `running` | `done` | `failed` | `cancelled`
- **UI**: `TaskCenterToasts` — bottom-right stacked cards

### LocalAIContext (`src/context/LocalAIContext.tsx`)
- **Purpose**: Ollama-first local AI orchestration
- **Desktop**: Uses `openbenttOllama` IPC (native `/api/tags`, `/api/version`, `/api/ps`, `/api/pull`)
- **Web fallback**: OpenAI-compatible `/v1/models` probe only
- **Selection**: Explicit preference > auto-discovered usable model > null
- **Progress**: Real `/api/pull` NDJSON streaming via IPC events → mirrored to TaskCenter
- **Never**: Fake progress, fake readiness, fake model lists

## 5. New Renderer Components

| Component | File | Purpose |
|-----------|------|---------|
| `AuthPage` | `src/components/AuthPage.tsx` | Clerk-backed sign in / sign up / local-only |
| `OnboardingFlow` | `src/components/OnboardingFlow.tsx` | 6-step first-run: welcome → auth → env check → Ollama → model → ready |
| `Sidebar` | `src/components/Sidebar.tsx` | Persistent nav: Search, New Chat, Chat, Projects, Library, Notebook, More (Benchmark, Providers, Settings), Recent chats, Local AI status, AccountMenu |
| `ModelPicker` | `src/components/ModelPicker.tsx` | Global default model selector: local Ollama models + current cloud model |
| `ChatHome` | `src/components/ChatHome.tsx` | Empty chat state with real suggestion actions |
| `LocalAIStatus` | `src/components/LocalAIStatus.tsx` | Compact indicator: checking / ready / no-models / unavailable |
| `CommandMenu` | `src/components/CommandMenu.tsx` | ⌘K palette: chats, projects, models, commands, navigation |
| `TaskCenterToasts` | `src/components/TaskCenterToasts.tsx` | Global background task status cards |
| `AccountMenu` | `src/components/AccountMenu.tsx` | Profile, settings link, real sign out |
| `SettingsPage` | `src/pages/SettingsPage.tsx` | Account, Local AI card, full SettingsPanel |

## 6. Electron Main Process Additions

### `electron/ollamaService.mjs`
- **Security**: Loopback-only origin validation (`127.0.0.1`, `localhost`, `::1`)
- **Model names**: Allowlisted regex, no shell metachars
- **IPC**: `ollama:status`, `ollama:listModels`, `ollama:pullModel`, `ollama:cancelPull`, `ollama:installInfo`, `ollama:recommendedModels`
- **Progress**: `ollama:pullProgress` event stream from real `/api/pull` NDJSON
- **Installer**: Opens official `https://ollama.com/download` URL, verifies post-install via API — never downloads/executes binaries
- **Tests**: `electron/ollamaService.test.mjs` (8 tests: origin allowlist, model allowlist, progress aggregation, ranking, install info)

### `electron/preload.cjs` (new bridge)
```javascript
contextBridge.exposeInMainWorld("openbenttOllama", {
  status, listModels, pullModel, cancelPull, installInfo, recommendedModels,
  onPullProgress
});
```

### `electron/main.mjs` (registration)
```javascript
import { registerOllamaIpc } from "./ollamaService.mjs";
// ...
registerOllamaIpc(ipcMain, { getWindow: () => BrowserWindow.getAllWindows()[0] });
```

## 7. Model Selection Logic (`src/lib/ollama/selection.ts`)

```typescript
function isChatUsableModel(name: string): boolean {
  return !EMBED_RE.test(name);  // embedding models excluded
}

function scoreModel(name: string): number {
  // Lower = better. Instruct/chat bonus, small param bonus, known family bonus.
}

export function autoSelectOllamaModel(installed, explicitPreference?): AutoSelectResult
```

- Embedding models (nomic-embed, bge, e5, gte) never selected for chat
- Small instruct models ranked first (qwen3:1.7b, smollm2:1.7b, gemma3:1b)
- User preference preserved if still installed

## 8. Onboarding State Machine (`src/lib/onboarding/stateMachine.ts`)

| State | Event → Next State |
|-------|-------------------|
| `FIRST_LAUNCH` | `START` → `AUTH_REQUIRED` |
| `AUTH_REQUIRED` | `AUTH_STARTED` → `AUTHENTICATING` |
| | `AUTH_SKIPPED_LOCAL` → `LOCAL_ONLY` |
| `AUTHENTICATING` | `AUTH_SUCCEEDED` → `AUTHENTICATED` |
| | `AUTH_FAILED` → `AUTH_REQUIRED` |
| `AUTHENTICATED` | `ENV_DONE` → `ENVIRONMENT_CHECK` |
| `ENVIRONMENT_CHECK` | `OLLAMA_FOUND` → `MODEL_DISCOVERY` |
| | `OLLAMA_MISSING` → `OLLAMA_CHECK` |
| `OLLAMA_CHECK` | `OLLAMA_FOUND` → `MODEL_DISCOVERY` |
| | `OLLAMA_MISSING` → `MODEL_SETUP` |
| `MODEL_DISCOVERY` | `MODEL_FOUND` → `READY` |
| | `MODEL_NEEDED` → `MODEL_SETUP` |
| `MODEL_SETUP` | `MODEL_READY` → `READY` |
| `READY` | `ONBOARDING_DONE` → `READY` |
| `RESUME_EXISTING_USER` | `ONBOARDING_DONE` → `READY` |
| `LOCAL_ONLY` | `ENV_DONE` → `ENVIRONMENT_CHECK` |

## 9. Keyboard Shortcuts (`src/hooks/useGlobalShortcuts.ts`)

| Shortcut | Action |
|----------|--------|
| `⌘K` / `Ctrl+K` | Open CommandMenu |
| `⌘N` / `Ctrl+N` | New chat (outside text input) |
| `⌘,` / `Ctrl+,` | Open Settings |
| `Escape` | Close transient UI (handled per-component) |

## 10. Security Invariants (Phases 5–8 Preserved)

1. **No shell from renderer**: All new IPC is narrow (`status`, `listModels`, `pullModel`, `cancelPull`, `installInfo`, `recommendedModels`)
2. **Loopback only**: Ollama origin validated to `127.0.0.1`/`localhost`/`::1`
3. **Model name allowlist**: No shell injection possible
4. **Installer safety**: Opens official URL only, verifies via API, never downloads/executes
5. **Policy boundary**: Chat → Phase 5 tool registry → Phase 6 runtime → Phase 7 connectors → Phase 8 action gate (unchanged)
6. **Clerk secrets**: Publishable key only in renderer; no password storage

## 11. Zero-Mock Compliance

| Area | Real Implementation |
|------|-------------------|
| Auth | Clerk SDK (publishable key) — no fake login |
| Ollama status | `/api/version`, `/api/tags`, `/api/ps` via IPC |
| Model list | Real installed models from Ollama API |
| Model download | Real `/api/pull` NDJSON streaming |
| Progress | Parsed from Ollama events — never animated fake % |
| Model readiness | Verified via `/api/tags` after pull completes |
| Model selection | `autoSelectOllamaModel()` — pure logic, unit tested |
| Onboarding | Persisted state machine, resumes mid-flow |

## 12. Files Added/Modified (Phase 9 Core)

### Added
- `docs/PHASE_9_AUDIT.md` — Repository audit
- `src/context/AuthContext.tsx` — Clerk auth
- `src/context/OnboardingContext.tsx` — Onboarding state machine
- `src/context/TaskCenterContext.tsx` — Global task surface
- `src/context/LocalAIContext.tsx` — Ollama orchestration
- `src/lib/ollama/selection.ts` — Auto-selection logic
- `src/lib/ollama/selection.test.ts` — Unit tests
- `src/lib/ollama/desktopApi.ts` — Typed IPC bridge
- `src/lib/onboarding/stateMachine.ts` — State transitions
- `src/lib/onboarding/stateMachine.test.ts` — Unit tests
- `src/hooks/useGlobalShortcuts.ts` — Keyboard shortcuts
- `src/components/AuthPage.tsx`
- `src/components/OnboardingFlow.tsx`
- `src/components/ModelPicker.tsx`
- `src/components/ChatHome.tsx`
- `src/components/LocalAIStatus.tsx`
- `src/components/CommandMenu.tsx`
- `src/components/TaskCenterToasts.tsx`
- `src/components/AccountMenu.tsx`
- `src/pages/SettingsPage.tsx`
- `electron/ollamaService.mjs` — Main process Ollama service
- `electron/ollamaService.test.mjs` — Main process unit tests

### Modified
- `src/App.tsx` — New provider stack, chat-first routing, onboarding routes
- `src/layouts/AppLayout.tsx` — New sidebar, CommandMenu, TaskCenterToasts, global shortcuts, local-AI-aware setup redirect
- `src/components/Sidebar.tsx` — Real nav items, recent chats, LocalAIStatus, AccountMenu
- `src/components/HomeChatArea.tsx` — Shows ChatHome when empty
- `src/components/AppChromeHeader.tsx` — ModelPicker in header
- `src/components/SettingsPanel.tsx` — (unchanged, reused)
- `electron/main.mjs` — `START_PATH="/chat"`, register `ollamaService`
- `electron/preload.cjs` — Add `openbenttOllama` bridge
- `scripts/check-electron-security.mjs` — Expect 6 bridges
- `docs/THREAT_MODEL.md` — Document 6th bridge
- `.env.example` — Document `VITE_CLERK_PUBLISHABLE_KEY`

## 13. What Was NOT Done (Per Spec)

- ❌ No Cobentt integration / product switcher / website import
- ❌ No new autonomous agent system
- ❌ No new MCP/connector platform
- ❌ No arbitrary shell execution
- ❌ No mock/fake production implementations
- ❌ GGUF/llama.cpp removed — kept as Advanced behind existing Settings → AI → "Local file model"

## 14. Acceptance Criteria Coverage

| Criterion | Status |
|-----------|--------|
| One unified desktop shell | ✅ `AppLayout` shared by Chat, Labs, Settings |
| Chat immediately available | ✅ Default route `/chat` after onboarding |
| Projects not accidental homepage | ✅ `/projects` is one nav item, not default |
| Sidebar coherent | ✅ Real nav, recent chats, local AI status, account |
| Clerk signup/login/logout | ✅ `AuthPage` + `AuthContext` |
| Session restoration | ✅ Clerk SDK handles automatically |
| Onboarding state machine | ✅ 11 states, persisted, resumes mid-flow |
| Ollama detection | ✅ `ollama:status` IPC → `/api/version` + `/api/tags` |
| Existing models discovered | ✅ `ollama:listModels` + `autoSelectOllamaModel` |
| No unnecessary download | ✅ Selection prefers existing installed model |
| Ollama absence detected | ✅ Health = "unavailable" → setup flow |
| Real installation flow | ✅ Opens official URL, verifies via API |
| Real model download | ✅ `/api/pull` streaming via IPC |
| Background download | ✅ Fire-and-forget, progress via events |
| Real progress shown | ✅ NDJSON parsed, percent/total/speed |
| Model ready after verification | ✅ `/api/tags` re-check after pull |
| Local chat works | ✅ `openai_compatible` provider with Ollama base URL |
| Cloud chat still works | ✅ OpenRouter/Anthropic/etc. unchanged |
| GGUF preserved as Advanced | ✅ Settings → AI → "Local file model" |
| Broken llama.cpp not shown | ✅ Only shown when explicitly selected |
| Offline local AI | ✅ `LocalAIContext` works without network |
| Settings coherent | ✅ Account / AI & Models / Providers / etc. |
| Keyboard nav | ✅ ⌘K, ⌘N, ⌘, |
| Accessibility | ✅ ARIA labels, focus management, contrast |
| Tests pass | ✅ 571 vitest + 133 electron + 13 new unit = 717 |
| Build passes | ✅ `npm run build` |
| Security checks pass | ✅ `npm run lint` |
| Zero mock | ✅ All new production code uses real providers |